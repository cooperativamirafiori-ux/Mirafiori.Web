/**
 * GET /api/cron/timbrature-alert — Vercel Cron, ogni sera.
 *
 * Avvisa chi ha giornate lavorative senza ore che stanno per uscire dalla
 * finestra dei tre giorni. E' l'unico momento utile: dopo, la persona non puo'
 * piu' rimediare da sola e la correzione deve passare dal responsabile.
 *
 * Volutamente stretto: guarda solo i giorni che si chiudono entro domani, cosi'
 * la mail arriva quando serve davvero e non diventa rumore quotidiano.
 *
 * Sicurezza: Bearer CRON_SECRET, se impostato.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  GIORNI_INDIETRO,
  getDipendenti,
  oggiRoma,
  riepilogoPeriodo,
  listTimbrature,
  statoMese,
} from '@/lib/timbrature/data'
import { notificaGiornateInScadenza } from '@/lib/timbrature/notifiche'
import { linkTimbrature } from '@/lib/timbrature/flusso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function addGiorni(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const oggi = oggiRoma()
  // I giorni ancora rimediabili, dal piu' urgente: quello che scade stanotte.
  const finestra: string[] = []
  for (let i = GIORNI_INDIETRO; i >= 1; i--) finestra.push(addGiorni(oggi, -i))
  const from = finestra[0]

  try {
    const dipendenti = await getDipendenti(true)
    let inviati = 0
    const dettaglio: string[] = []

    for (const dip of dipendenti) {
      if (!dip.email) continue
      const [riepilogo, righe] = await Promise.all([
        riepilogoPeriodo(dip.id, from, oggi),
        listTimbrature(dip.id, from, oggi),
      ])
      const conRighe = new Set(righe.map((r) => r.data))

      const giornate: { data: string; ultimoGiorno: string; oreAttese: number }[] = []
      for (const data of finestra) {
        const g = riepilogo.giorni.find((x) => x.data === data)
        if (!g || g.festivo || g.oreAttese <= 0) continue
        if (conRighe.has(data)) continue
        // Un mese gia' passato al responsabile non si sollecita piu'.
        const stato = await statoMese(dip.id, Number(data.slice(0, 4)), Number(data.slice(5, 7)))
        if (stato !== 'aperto') continue
        giornate.push({ data, ultimoGiorno: addGiorni(data, GIORNI_INDIETRO), oreAttese: g.oreAttese })
      }

      if (!giornate.length) continue
      await notificaGiornateInScadenza({
        to: dip.email,
        cognomeNome: dip.cognomeNome,
        giornate,
        linkApp: linkTimbrature(),
      })
      inviati++
      dettaglio.push(`${dip.cognomeNome}: ${giornate.map((g) => g.data).join(', ')}`)
    }

    return NextResponse.json({ ok: true, oggi, esaminati: dipendenti.length, inviati, dettaglio })
  } catch (e) {
    console.error('[cron timbrature-alert]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
