/**
 * GET /api/cron/sollecito-timbrature — Vercel Cron, ogni mattina.
 *
 * Nei giorni 1-5 del mese invia a ogni dipendente un sollecito ALERT a
 * completare il foglio ore del MESE PRECEDENTE, finché quel mese non è chiuso
 * dalle HR. Fuori da quella finestra non fa nulla.
 *
 * Sicurezza: come /api/cron/promemoria-ore (Bearer CRON_SECRET se impostato).
 */

import { NextRequest, NextResponse } from 'next/server'
import { statoMeseTutti, oggiRoma, scadenzaCorrezioni } from '@/lib/timbrature'
import { notificaSollecitoTimbrature } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MESI = ['', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const oggi = oggiRoma() // YYYY-MM-DD (Europe/Rome)
  const giornoMese = Number(oggi.slice(8, 10))
  if (giornoMese < 1 || giornoMese > 5) {
    return NextResponse.json({ ok: true, skip: 'fuori finestra 1-5', oggi })
  }

  // mese precedente
  const annoOggi = Number(oggi.slice(0, 4))
  const meseOggi = Number(oggi.slice(5, 7))
  const anno = meseOggi === 1 ? annoOggi - 1 : annoOggi
  const mese = meseOggi === 1 ? 12 : meseOggi - 1

  const scadenza = scadenzaCorrezioni(anno, mese) // 5 del mese corrente
  const giorniRimasti = Math.max(0, 5 - giornoMese)
  const linkApp = `${process.env.APP_BASE_URL || 'https://mirafiori-web.vercel.app'}/timbrature`

  try {
    const stato = await statoMeseTutti(anno, mese)
    // Esclusi i non più abilitati: compaiono nel cruscotto perché le HR devono
    // poter chiudere il loro ultimo mese, ma non hanno più accesso all'app e
    // sollecitarli a "completare il foglio ore" sarebbe solo fastidioso.
    const daAvvisare = stato.filter((s) => s.stato !== 'chiuso' && !!s.email && !s.disattivato)
    let inviati = 0
    for (const s of daAvvisare) {
      await notificaSollecitoTimbrature({
        to: s.email,
        cognomeNome: s.cognomeNome,
        meseNome: MESI[mese],
        anno,
        scadenza,
        giorniRimasti,
        giorniIncompleti: s.giorniIncompleti,
        scostamento: s.scostamento,
        linkApp,
      })
      inviati++
    }
    return NextResponse.json({ ok: true, periodo: `${mese}/${anno}`, candidati: daAvvisare.length, inviati })
  } catch (e) {
    console.error('[cron sollecito-timbrature]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
