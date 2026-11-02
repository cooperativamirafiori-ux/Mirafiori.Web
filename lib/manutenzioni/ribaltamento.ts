/**
 * Ribaltamento dei costi di una manutenzione sul centro di costo della struttura
 * (deciso con Dennis il 2/11/2026, docs/servizi-interni-piano.md § Ribaltamento).
 *
 * Tutti i costi di manutenzione passano da Cura Ambienti (cc24). Per ogni
 * richiesta e per ogni mese di addebito nasce UN addebito interno
 * cc24 → CC della struttura, con una riga per costo (fattura, ore, spesa).
 * Lo scrive `riscriviAddebitoAutomatico`, lo stesso strumento degli addebiti a mano.
 *
 * Se la struttura non ha un centro di costo, o il suo centro è cc24 stesso,
 * il costo resta su Cura Ambienti e non si addebita a nessuno.
 */

import { supabase } from '@/lib/core/supabase'
import { riscriviAddebitoAutomatico, meseChiuso } from '@/lib/servizi-interni/automatici'
import { getStruttureCc } from '@/lib/utenze/data'
import { CC_CURA_AMBIENTI, leggiCosti } from './costi'
import type { CostoPratica } from '@/types/manutenzioni'

const euro = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const virgola = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 2 })

/** La riga dell'addebito per un costo: cosa vede chi riceve. */
export function rigaDi(c: CostoPratica): { descrizione: string; importo: number } | null {
  if (c.importo == null) return null
  if (c.tipo === 'fattura') {
    const f = c.fattura
    const parte = f && c.importo < f.imponibile - 0.005 ? ` (parte: ${euro(c.importo)} € su ${euro(f.imponibile)} €)` : ''
    return {
      descrizione: `Fattura ${f?.numero ?? ''}${c.fornitore ? ` ${c.fornitore}` : ''}${parte}`.replace(/\s+/g, ' ').trim(),
      importo: c.importo,
    }
  }
  if (c.tipo === 'ore') {
    const euroOra = c.ore ? c.importo / c.ore : 0
    return {
      descrizione: `${virgola(c.ore ?? 0)} h ${c.figura === 'pulizie' ? 'pulizie' : 'manutenzione'} Cura Ambienti × ${euro(euroOra)} €/h${c.descrizione ? ` — ${c.descrizione}` : ''}`,
      importo: c.importo,
    }
  }
  return { descrizione: `Spesa: ${c.descrizione ?? ''}${c.fornitore ? ` (${c.fornitore})` : ''}`.trim(), importo: c.importo }
}

/**
 * Riscrive l'addebito di una richiesta per un mese, dai suoi costi attuali.
 * Ritorna un avviso da mostrare se qualcosa resta fuori (es. ore senza tariffa),
 * null se è tutto a posto.
 */
export async function ribaltaManutenzione(spItemId: string, mese: string, utente: string): Promise<string | null> {
  if (meseChiuso(mese)) return null
  const tutti = await leggiCosti(spItemId)
  const delMese = tutti.filter((c) => (c.meseAddebito ?? `${c.data.slice(0, 7)}-01`) === mese)

  // Struttura e CC sono fotografati sui costi alla creazione: si prende quella dei costi.
  const { data: righeDb, error } = await supabase()
    .from('manutenzione_costo')
    .select('id_richiesta, struttura_codice, cc_codice, creato_il')
    .eq('richiesta_sp_id', spItemId)
    .order('creato_il', { ascending: false })
  if (error) throw new Error(`Costi: ${error.message}`)
  const fonte = (righeDb ?? []).find((r) => r.cc_codice) ?? righeDb?.[0]
  const idRichiesta = fonte?.id_richiesta ?? spItemId
  const ccA = (fonte?.cc_codice ?? '').toLowerCase()
  const strutturaCodice = fonte?.struttura_codice ?? null
  const strutturaNome = strutturaCodice
    ? (await getStruttureCc().catch(() => [])).find((s) => s.codice === strutturaCodice)?.nome ?? strutturaCodice
    : null

  const righe = delMese.map(rigaDi).filter((r): r is NonNullable<typeof r> => r !== null)
  const senzaTariffa = delMese.filter((c) => c.importo == null).length
  const nessunDestinatario = !ccA || ccA === CC_CURA_AMBIENTI

  await riscriviAddebitoAutomatico({
    origine: 'manutenzione',
    origineId: spItemId,
    mese,
    ccDa: CC_CURA_AMBIENTI,
    // Con le righe vuote il destinatario non conta: l'addebito, se c'era, sparisce.
    ccA: nessunDestinatario ? CC_CURA_AMBIENTI : ccA,
    descrizione: `Manutenzione ${idRichiesta}${strutturaNome ? ` · ${strutturaNome}` : ''}`,
    strutturaCodice,
    strutturaNome,
    righe: nessunDestinatario ? [] : righe,
    utente,
  })

  if (nessunDestinatario && delMese.length) {
    return 'La struttura non ha un centro di costo diverso da Cura Ambienti: questi costi restano su Cura Ambienti.'
  }
  if (senzaTariffa) {
    return `${senzaTariffa === 1 ? 'Un costo a ore resta' : `${senzaTariffa} costi a ore restano`} fuori dall'addebito: manca la tariffa di Cura Ambienti di quel mese.`
  }
  return null
}

/** Tutti i mesi aperti in cui una richiesta ha (o aveva) costi: per riallineare. */
export async function mesiApertiDi(spItemId: string): Promise<string[]> {
  const [{ data: costi }, { data: addebiti }] = await Promise.all([
    supabase().from('manutenzione_costo').select('mese_addebito, data').eq('richiesta_sp_id', spItemId),
    supabase().from('addebito_interno').select('mese').eq('origine_tipo', 'manutenzione').eq('origine_id', spItemId),
  ])
  const mesi = new Set<string>()
  for (const c of costi ?? []) mesi.add(c.mese_addebito ? String(c.mese_addebito) : `${String(c.data).slice(0, 7)}-01`)
  for (const a of addebiti ?? []) mesi.add(String(a.mese))
  return [...mesi].filter((m) => !meseChiuso(m))
}

/**
 * Giro notturno: riscrive gli addebiti di tutte le richieste che hanno costi (o
 * addebiti) in un mese ancora aperto. Ripara quelli rimasti indietro per un
 * errore al momento del salvataggio. Ritorna quante richieste ha toccato.
 */
export async function riallineaManutenzioni(utente: string): Promise<{ richieste: number; errori: string[] }> {
  const da = new Date()
  da.setUTCMonth(da.getUTCMonth() - 2)
  const dal = `${da.toISOString().slice(0, 7)}-01`
  const [{ data: costi, error }, { data: addebiti }] = await Promise.all([
    supabase().from('manutenzione_costo').select('richiesta_sp_id, mese_addebito, data').gte('data', dal),
    supabase().from('addebito_interno').select('origine_id, mese').eq('origine_tipo', 'manutenzione').gte('mese', dal),
  ])
  if (error) throw new Error(`Costi: ${error.message}`)
  const perRichiesta = new Map<string, Set<string>>()
  const aggiungi = (id: string, mese: string) => {
    if (meseChiuso(mese)) return
    if (!perRichiesta.has(id)) perRichiesta.set(id, new Set())
    perRichiesta.get(id)!.add(mese)
  }
  for (const c of costi ?? []) aggiungi(c.richiesta_sp_id, c.mese_addebito ? String(c.mese_addebito) : `${String(c.data).slice(0, 7)}-01`)
  for (const a of addebiti ?? []) aggiungi(a.origine_id, String(a.mese))

  const errori: string[] = []
  for (const [id, mesi] of perRichiesta) {
    for (const mese of mesi) {
      try {
        await ribaltaManutenzione(id, mese, utente)
      } catch (e) {
        errori.push(`manutenzione ${id} ${mese}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }
  return { richieste: perRichiesta.size, errori }
}
