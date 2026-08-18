/**
 * GET /api/cron/acquisti — job giornaliero della sezione Acquisti.
 *
 * Quattro compiti, in ordine:
 *   1. digest delle nuove richieste → ufficio + gestori (una mail al giorno,
 *      non una per richiesta: è la differenza fra una casella letta e una ignorata);
 *   2. richiesta di conferma consegna al richiedente il giorno previsto;
 *   3. sollecito dopo GIORNI_SOLLECITO giorni senza riscontro;
 *   4. chiusura d'ufficio dopo GIORNI_AUTOCHIUSURA giorni, così le richieste
 *      non restano appese in "Ordinata" per sempre.
 *
 * Sicurezza: Vercel allega `Authorization: Bearer ${CRON_SECRET}` se l'env è
 * impostata. Il job è idempotente (flag DigestInviato / NotificaConsegnaInviata /
 * SollecitoInviato), quindi una doppia esecuzione non produce doppie mail.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getAcquisti,
  aggiornaAcquisto,
  acquistiConfigurato,
} from '@/lib/acquisti/data'
import {
  chiudiSenzaRiscontro,
  emailGestori,
  inviaRichiestaConferma,
  linkGestione,
} from '@/lib/acquisti/flusso'
import { destinatariAcquisti, notificaDigestAcquisti } from '@/lib/acquisti/notifiche'
import { GIORNI_AUTOCHIUSURA, GIORNI_SOLLECITO, dataBreve } from '@/types/acquisti'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** Giorni trascorsi da una data (negativo se è nel futuro). */
function giorniDa(iso?: string): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const oggi = new Date(`${ymd(new Date())}T00:00:00Z`)
  const rif = new Date(`${ymd(d)}T00:00:00Z`)
  return Math.round((oggi.getTime() - rif.getTime()) / 86_400_000)
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }
  if (!acquistiConfigurato()) {
    return NextResponse.json({ ok: true, salto: 'sezione acquisti non configurata' })
  }

  const esito = {
    digest: 0,
    confermeInviate: 0,
    solleciti: 0,
    chiusureAutomatiche: 0,
    errori: [] as string[],
  }

  try {
    const tutte = await getAcquisti()
    const gestori = await emailGestori()

    // --- 1. digest delle nuove richieste ------------------------
    const daDigest = tutte.filter(
      (a) => !a.digestInviato && !['Annullata', 'Non approvata'].includes(a.stato),
    )
    if (daDigest.length) {
      await notificaDigestAcquisti({
        to: destinatariAcquisti(gestori),
        righe: daDigest.map((a) => ({
          codice: a.codice,
          richiedente: a.richiedenteNome,
          centroCosto: a.centroCosto?.value ?? '—',
          descrizione: a.descrizione,
          quantita: a.quantita,
          urgenza: a.urgenza,
          serveEntro: a.serveEntro ? dataBreve(a.serveEntro) : undefined,
        })),
        linkApp: linkGestione(),
      })
      for (const a of daDigest) {
        await aggiornaAcquisto(a.spItemId, { DigestInviato: true })
      }
      esito.digest = daDigest.length
    }

    // --- 2/3/4. ciclo di vita della consegna ---------------------
    const ordinate = tutte.filter((a) => a.stato === 'Ordinata')

    for (const a of ordinate) {
      const giorni = giorniDa(a.dataConsegnaPrevista)
      // Senza data prevista non c'è nulla da sollecitare: la richiesta resta
      // nella coda del gestore, che è il posto giusto.
      if (giorni == null) continue

      try {
        if (giorni >= GIORNI_AUTOCHIUSURA) {
          await chiudiSenzaRiscontro(a)
          esito.chiusureAutomatiche++
          continue
        }
        if (giorni >= GIORNI_SOLLECITO && !a.sollecitoInviato) {
          const inviato = await inviaRichiestaConferma(a, {
            sollecito: true,
            giorniAllaChiusura: GIORNI_AUTOCHIUSURA - giorni,
          })
          if (inviato) esito.solleciti++
          continue
        }
        if (giorni >= 0 && !a.notificaConsegnaInviata) {
          const inviato = await inviaRichiestaConferma(a, {
            sollecito: false,
            giorniAllaChiusura: GIORNI_AUTOCHIUSURA,
          })
          if (inviato) esito.confermeInviate++
        }
      } catch (e: any) {
        console.error('[cron acquisti]', a.codice, e)
        esito.errori.push(`${a.codice}: ${e?.message ?? 'errore'}`)
      }
    }

    return NextResponse.json({ ok: true, ...esito })
  } catch (e: any) {
    console.error('[GET /api/cron/acquisti]', e)
    return NextResponse.json({ error: e?.message ?? 'Errore interno' }, { status: 500 })
  }
}
