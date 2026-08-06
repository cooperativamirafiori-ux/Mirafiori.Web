/**
 * GET /api/cron/sollecito-timbrature — Vercel Cron, ogni mattina.
 *
 * E' il motore del flusso mensile. Quattro cose, in quest'ordine:
 *
 *   1. ultimi giorni utili → sollecito ai dipendenti che hanno ancora buchi
 *      nel mese che sta per chiudersi;
 *   2. finestra scaduta → i mesi ancora aperti passano in "da validare" e i
 *      responsabili ricevono l'elenco dei fogli da controllare;
 *   3. fogli del mese precedente fermi in "da validare" o "contestato" →
 *      promemoria quotidiano al responsabile (solo al referente reale, mai
 *      alle HR), finche' non li guarda. I fogli piu' vecchi non vengono
 *      risollecitati per mail: restano visibili nel cruscotto;
 *   4. fogli "validato" senza risposta → promemoria quotidiano al dipendente.
 *      Il foglio resta in sospeso: nessuna conferma automatica. Se la risposta
 *      non arriva mai, e' il responsabile a chiudere d'ufficio dal cruscotto.
 *
 * Sicurezza: Bearer CRON_SECRET, se impostato.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  GIORNI_INDIETRO,
  apriValidazioni,
  chiusureInStato,
  giorniDa,
  meseScaduto,
  oggiRoma,
  segnaSollecito,
  statoMeseTutti,
  ultimoGiornoUtile,
} from '@/lib/timbrature/data'
import { notificaFogliDaValidare, notificaSollecitoTimbrature } from '@/lib/timbrature/notifiche'
import {
  MESI_IT,
  destinatarioResponsabile,
  inviaRichiestaConferma,
  linkTimbrature,
  linkValidazione,
} from '@/lib/timbrature/flusso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Mese precedente a (anno, mese). */
function precedente(anno: number, mese: number): { anno: number; mese: number } {
  return mese === 1 ? { anno: anno - 1, mese: 12 } : { anno, mese: mese - 1 }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const oggi = oggiRoma()
  const annoOggi = Number(oggi.slice(0, 4))
  const meseOggi = Number(oggi.slice(5, 7))
  const prec = precedente(annoOggi, meseOggi)
  const esito: Record<string, unknown> = { oggi }

  try {
    // --- 1) ultimi giorni utili sul mese precedente ---------------------------
    const scadenza = ultimoGiornoUtile(prec.anno, prec.mese)
    if (oggi <= scadenza) {
      const giorniRimasti = Math.max(0, Number(scadenza.slice(8, 10)) - Number(oggi.slice(8, 10)))
      const stato = await statoMeseTutti(prec.anno, prec.mese)
      const daAvvisare = stato.filter(
        (s) => s.stato === 'aperto' && !!s.email && !s.disattivato && (s.giorniIncompleti > 0 || s.scostamento < -0.001),
      )
      for (const s of daAvvisare) {
        await notificaSollecitoTimbrature({
          to: s.email,
          cognomeNome: s.cognomeNome,
          meseNome: MESI_IT[prec.mese],
          anno: prec.anno,
          scadenza,
          giorniRimasti,
          giorniIncompleti: s.giorniIncompleti,
          scostamento: s.scostamento,
          linkApp: linkTimbrature(),
        })
      }
      esito.solleciti_dipendenti = daAvvisare.length
    }

    // --- 2) la finestra e' scaduta: si passa ai responsabili ------------------
    // Si guardano anche i due mesi prima: se il cron e' saltato un giorno, un
    // mese non deve restare aperto per sempre.
    // Chi e' passato in validazione proprio adesso: per queste persone la mail
    // al responsabile e' la prima, non un promemoria.
    const appenaPassati = new Set<number>()
    let cursore = prec
    for (let i = 0; i < 3; i++) {
      if (meseScaduto(cursore.anno, cursore.mese)) {
        for (const x of await apriValidazioni(cursore.anno, cursore.mese)) {
          appenaPassati.add(x.dipendente.id)
        }
      }
      cursore = precedente(cursore.anno, cursore.mese)
    }
    esito.passati_in_validazione = appenaPassati.size

    // --- 3) promemoria ai responsabili, solo mese precedente ------------------
    // Su richiesta di Dennis (06/08/2026): non si risollecitano piu' per mail i
    // mesi ancora prima del precedente (restano nel cruscotto, non intasano la
    // mail), e non c'e' piu' ripiego alle HR quando manca il referente.
    const inAttesaTutte = await chiusureInStato(['da_validare', 'contestato'])
    const inAttesa = inAttesaTutte.filter(
      ({ chiusura }) => chiusura.anno === prec.anno && chiusura.mese === prec.mese,
    )
    const perResponsabile = new Map<
      string,
      { nominativi: string[]; mese: number; anno: number; fermiDa: number; nuovi: boolean }
    >()
    for (const { chiusura, dipendente } of inAttesa) {
      const destinatari = destinatarioResponsabile(dipendente)
      // "Fermo da": dal giorno in cui la palla e' passata al responsabile, non
      // dall'inizio del mese, altrimenti un mese appena chiuso sembra in ritardo.
      const fermiDa = giorniDa(
        chiusura.contestatoIl ?? `${ultimoGiornoUtile(chiusura.anno, chiusura.mese)}T00:00:00Z`,
      )
      for (const to of destinatari) {
        const cur =
          perResponsabile.get(to) ??
          { nominativi: [], mese: chiusura.mese, anno: chiusura.anno, fermiDa: 0, nuovi: false }
        cur.nominativi.push(
          `${dipendente.cognomeNome} — ${MESI_IT[chiusura.mese]} ${chiusura.anno}` +
            (chiusura.stato === 'contestato' ? ' (contestato)' : ''),
        )
        cur.fermiDa = Math.max(cur.fermiDa, fermiDa)
        if (appenaPassati.has(dipendente.id)) cur.nuovi = true
        perResponsabile.set(to, cur)
      }
    }
    for (const [to, v] of perResponsabile) {
      await notificaFogliDaValidare({
        to,
        meseNome: MESI_IT[v.mese],
        anno: v.anno,
        nominativi: v.nominativi,
        linkApp: linkValidazione(),
        sollecito: !v.nuovi,
        giorniFermi: v.nuovi ? undefined : v.fermiDa || undefined,
      })
    }
    esito.responsabili_avvisati = perResponsabile.size
    esito.fogli_da_validare = inAttesa.length
    esito.fogli_da_validare_arretrati = inAttesaTutte.length - inAttesa.length

    // --- 4) promemoria ai dipendenti che non hanno ancora confermato ----------
    const daConfermare = await chiusureInStato(['validato'])
    let ricordati = 0
    for (const { chiusura, dipendente } of daConfermare) {
      if (chiusura.ultimoSollecito === oggi) continue // gia' fatto oggi
      const inviato = await inviaRichiestaConferma(dipendente, chiusura, {
        sollecito: true,
        giorniInAttesa: chiusura.validatoIl ? giorniDa(chiusura.validatoIl) : undefined,
      })
      if (inviato) {
        await segnaSollecito(dipendente.id, chiusura.anno, chiusura.mese)
        ricordati++
      }
    }
    esito.conferme_sollecitate = ricordati
    esito.finestra_giorni = GIORNI_INDIETRO + 1

    return NextResponse.json({ ok: true, ...esito })
  } catch (e) {
    console.error('[cron sollecito-timbrature]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
