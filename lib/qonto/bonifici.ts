/**
 * "Invia a Qonto": dalle scadenze da pagare alle richieste di bonifico su Qonto.
 *
 * Cosa fa l'app e cosa no:
 *  - l'app CREA la richiesta (a nome dell'account che ha fatto il login OAuth,
 *    Dennis); il denaro non si muove finché Claudia non la APPROVA nell'app
 *    Qonto, con la conferma di sicurezza. L'app non approva mai.
 *  - una richiesta per sottoconto: il bonifico parte dal sottoconto del
 *    servizio a cui è attribuita la fattura (cc_codice ↔ "ccN · …" su Qonto).
 *
 * Cosa non parte, e lo si dice riga per riga:
 *  - non "da pagare" (quindi niente da verificare, da approvare, pagata…);
 *  - senza servizio, o servizio senza sottoconto (es. Locanda, cc2);
 *  - senza IBAN, IBAN non valido, o con un blocco (IBAN mancante/cambiato);
 *  - già inviata e non rifiutata.
 *
 * Doppio invio: prima di chiamare Qonto le righe si "prenotano" con un update
 * condizionato (qonto_stato → 'invio'); la chiave di idempotenza è l'impronta
 * delle scadenze del gruppo, quindi un nuovo tentativo sullo stesso gruppo non
 * crea una seconda richiesta.
 */

import { createHash } from 'node:crypto'
import { supabase } from '@/lib/core/supabase'
import { getContiQonto } from '@/lib/qonto/data'
import { qontoOAuth } from '@/lib/qonto/oauth'
import { ibanValido, normIban } from '@/lib/pagamenti/verifica'

interface Riga {
  id: string
  stato: string
  importo: number | string
  iban: string | null
  blocco: string | null
  qonto_stato: string | null
  fattura_passiva: {
    fornitore: string
    numero_fornitore: string | null
    data_fornitore: string | null
    cc_codice: string | null
  } | null
}

export interface EsitoInvio {
  inviate: number
  richieste: Array<{ conto: string; bonifici: number; totale: number; id: string }>
  ignorate: Array<{ id: string; motivo: string }>
}

const dataIt = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '')
const causale = (f: NonNullable<Riga['fattura_passiva']>) =>
  `Fatt. ${f.numero_fornitore ?? ''}${f.data_fornitore ? ` del ${dataIt(f.data_fornitore)}` : ''}`.trim().slice(0, 140)

export async function inviaAQonto(ids: string[], utente: string): Promise<EsitoInvio> {
  const esito: EsitoInvio = { inviate: 0, richieste: [], ignorate: [] }
  if (ids.length === 0) return esito
  const db = supabase()
  const { data, error } = await db
    .from('scadenza')
    .select('id, stato, importo, iban, blocco, qonto_stato, fattura_passiva ( fornitore, numero_fornitore, data_fornitore, cc_codice )')
    .in('id', ids)
  if (error) throw new Error(`Lettura scadenze: ${error.message}`)
  const righe = (data ?? []) as unknown as Riga[]

  const conti = await getContiQonto()
  const sottoconto = new Map(conti.filter((c) => c.ccCodice).map((c) => [c.ccCodice!.toLowerCase(), c]))

  // Chi può partire, e da dove.
  const buone: Array<{ r: Riga; conto: (typeof conti)[number]; iban: string }> = []
  const no = (id: string, motivo: string) => esito.ignorate.push({ id, motivo })
  for (const id of ids) if (!righe.some((r) => r.id === id)) no(id, 'scadenza non trovata')
  for (const r of righe) {
    const f = r.fattura_passiva
    const iban = r.iban ? normIban(r.iban) : ''
    if (r.stato !== 'da_pagare') no(r.id, r.stato === 'da_approvare' ? 'sopra soglia: manca l’approvazione' : `non è da pagare (${r.stato})`)
    else if (r.qonto_stato && !['declined', 'canceled'].includes(r.qonto_stato)) no(r.id, 'già inviata a Qonto')
    else if (!f) no(r.id, 'uscita senza fattura: si paga a mano')
    else if (Number(r.importo) <= 0) no(r.id, 'importo non positivo')
    else if (r.blocco) no(r.id, r.blocco === 'iban_cambiato' ? 'IBAN cambiato: va confermato' : 'manca l’IBAN')
    else if (!iban || !ibanValido(iban)) no(r.id, 'IBAN assente o non valido')
    else if (!f.cc_codice) no(r.id, 'manca il servizio: sceglilo sulla riga')
    else if (!sottoconto.has(f.cc_codice.toLowerCase())) no(r.id, 'il servizio non ha un sottoconto Qonto')
    else buone.push({ r, conto: sottoconto.get(f.cc_codice.toLowerCase())!, iban })
  }
  if (buone.length === 0) return esito

  // Prenotazione: solo chi non è già in volo.
  const { data: prese, error: eP } = await db
    .from('scadenza')
    .update({ qonto_stato: 'invio', qonto_inviata_il: new Date().toISOString(), qonto_inviata_da: utente })
    .in('id', buone.map((b) => b.r.id))
    .eq('stato', 'da_pagare')
    .or('qonto_stato.is.null,qonto_stato.in.(declined,canceled)')
    .select('id')
  if (eP) throw new Error(`Prenotazione invio: ${eP.message}`)
  const prenotate = new Set((prese ?? []).map((p) => p.id as string))
  for (const b of buone) if (!prenotate.has(b.r.id)) no(b.r.id, 'la sta già inviando qualcun altro')

  // Un gruppo per sottoconto, al massimo 400 bonifici ciascuno.
  const gruppi = new Map<string, typeof buone>()
  for (const b of buone.filter((b) => prenotate.has(b.r.id))) {
    const k = b.conto.iban
    gruppi.set(k, [...(gruppi.get(k) ?? []), b])
  }

  for (const [debitIban, tutte] of gruppi) {
    for (let i = 0; i < tutte.length; i += 400) {
      const gruppo = tutte.slice(i, i + 400)
      const idsGruppo = gruppo.map((g) => g.r.id)
      const totale = gruppo.reduce((s, g) => s + Number(g.r.importo), 0)
      const impronta = createHash('sha256').update([...idsGruppo].sort().join(',')).digest('hex').slice(0, 32)
      const corpo = {
        request_multi_transfer: {
          note: `App Mirafiori · ${gruppo[0].conto.nome} · ${gruppo.length} ${gruppo.length === 1 ? 'fattura' : 'fatture'} · inviata da ${utente}`.slice(0, 250),
          debit_iban: debitIban,
          transfers: gruppo.map((g) => ({
            amount: Number(g.r.importo).toFixed(2),
            currency: 'EUR',
            credit_iban: g.iban,
            credit_account_name: g.r.fattura_passiva!.fornitore.slice(0, 140),
            credit_account_currency: 'EUR',
            reference: causale(g.r.fattura_passiva!),
          })),
        },
      }
      try {
        const r = await qontoOAuth<{ request_multi_transfer?: { id: string }; id?: string }>(
          'POST', '/requests/multi_transfers', corpo, impronta,
        )
        const idRichiesta = r.request_multi_transfer?.id ?? r.id
        if (!idRichiesta) throw new Error('Qonto non ha restituito l’id della richiesta')
        const { error: eS } = await db
          .from('scadenza')
          .update({ qonto_richiesta_id: idRichiesta, qonto_stato: 'pending', qonto_conto_iban: debitIban })
          .in('id', idsGruppo)
        if (eS) throw new Error(`Richiesta ${idRichiesta} creata su Qonto ma non registrata qui: ${eS.message}`)
        esito.inviate += gruppo.length
        esito.richieste.push({ conto: gruppo[0].conto.nome, bonifici: gruppo.length, totale, id: idRichiesta })
      } catch (e) {
        // Niente creato (o non si sa): le righe tornano inviabili. Un nuovo
        // tentativo sullo stesso gruppo usa la stessa chiave di idempotenza.
        await db.from('scadenza').update({ qonto_stato: null, qonto_inviata_il: null, qonto_inviata_da: null }).in('id', idsGruppo).eq('qonto_stato', 'invio')
        const motivo = e instanceof Error ? e.message : 'invio non riuscito'
        for (const id of idsGruppo) no(id, motivo)
      }
    }
  }
  return esito
}

interface RichiestaQonto {
  id: string
  status: 'pending' | 'approved' | 'declined' | 'canceled'
  processed_at: string | null
  declined_note: string | null
}

/**
 * Allinea le scadenze inviate con lo stato delle richieste su Qonto:
 *  - approvata → pagata (origine "banca", data = quando Qonto l'ha processata)
 *  - rifiutata o annullata → torna inviabile, con il motivo sulla riga
 */
export async function sincronizzaQonto(): Promise<{ controllate: number; pagate: number; rifiutate: number }> {
  const db = supabase()
  const { data, error } = await db
    .from('scadenza')
    .select('qonto_richiesta_id, qonto_inviata_il')
    .eq('qonto_stato', 'pending')
    .limit(2000)
  if (error) throw new Error(`Lettura invii Qonto: ${error.message}`)
  const inAttesa = new Set((data ?? []).map((r) => r.qonto_richiesta_id as string).filter(Boolean))
  const esito = { controllate: inAttesa.size, pagate: 0, rifiutate: 0 }
  if (inAttesa.size === 0) return esito

  const dal = (data ?? []).map((r) => r.qonto_inviata_il as string).sort()[0]
  const trovate = new Map<string, RichiestaQonto>()
  for (let pagina = 1; pagina <= 20 && trovate.size < inAttesa.size; pagina++) {
    const q = new URLSearchParams({ per_page: '100', page: String(pagina), created_at_from: new Date(Date.parse(dal) - 3_600_000).toISOString() })
    q.append('request_type[]', 'multi_transfer')
    const r = await qontoOAuth<{ requests: RichiestaQonto[]; meta?: { next_page?: number | null } }>('GET', `/requests?${q}`)
    for (const x of r.requests ?? []) if (inAttesa.has(x.id)) trovate.set(x.id, x)
    if (!r.meta?.next_page) break
  }

  for (const x of trovate.values()) {
    if (x.status === 'approved') {
      const giorno = (x.processed_at ?? new Date().toISOString()).slice(0, 10)
      const { data: agg } = await db
        .from('scadenza')
        .update({
          stato: 'pagata', data_pagamento: giorno, pagata_da: 'Qonto (richiesta approvata)',
          pagata_il: new Date().toISOString(), origine_pagamento: 'banca', qonto_stato: 'approved',
        })
        .eq('qonto_richiesta_id', x.id)
        .eq('stato', 'da_pagare')
        .select('id')
      // Righe già segnate pagate a mano nel frattempo: si registra solo l'esito.
      await db.from('scadenza').update({ qonto_stato: 'approved' }).eq('qonto_richiesta_id', x.id).neq('qonto_stato', 'approved')
      esito.pagate += agg?.length ?? 0
    } else if (x.status === 'declined' || x.status === 'canceled') {
      const { data: agg } = await db
        .from('scadenza')
        .update({
          qonto_stato: x.status,
          segnalazione: `${x.status === 'declined' ? 'Rifiutata' : 'Annullata'} su Qonto${x.declined_note ? `: ${x.declined_note}` : ''}`.slice(0, 500),
        })
        .eq('qonto_richiesta_id', x.id)
        .select('id')
      esito.rifiutate += agg?.length ?? 0
    }
  }
  return esito
}
