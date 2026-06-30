/**
 * GET /api/cron/scadenze-software — eseguito da Vercel Cron (1 volta al giorno).
 *
 * Invia a ufficio.rendicontazione@cooperativamirafiori.com un alert quando mancano
 * 20 giorni (o meno) alla scadenza di un abbonamento software, una sola volta per
 * ciascuna scadenza (flag AlertScadenzaNotificata = data scadenza già notificata).
 * I software con stato "Disdetto" vengono ignorati.
 *
 * Sicurezza: Vercel allega automaticamente `Authorization: Bearer ${CRON_SECRET}`
 * se l'env CRON_SECRET è impostata.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSoftware, patchSoftwareFields } from '@/lib/software'
import { notificaScadenzaSoftware } from '@/lib/notifications'
import { dataBreve } from '@/lib/documenti-prestazione'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GIORNI_ALERT = 20

function giorniAllaScadenza(scadenza?: string): number | null {
  if (!scadenza) return null
  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  const d = new Date(`${scadenza.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return Math.round((d.getTime() - oggi.getTime()) / 86_400_000)
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  try {
    const tutti = await getSoftware()

    const daAvvisare = tutti.filter((s) => {
      if (!s.scadenza) return false
      if ((s.stato || '').toLowerCase() === 'disdetto') return false
      const g = giorniAllaScadenza(s.scadenza)
      if (g == null || g < 0 || g > GIORNI_ALERT) return false
      // già avvisato per QUESTA scadenza?
      return (s.alertScadenzaNotificata ?? '').slice(0, 10) !== s.scadenza.slice(0, 10)
    })

    let inviati = 0
    for (const s of daAvvisare) {
      const g = giorniAllaScadenza(s.scadenza)!
      await notificaScadenzaSoftware({
        servizio: s.servizio,
        scadenza: dataBreve(s.scadenza!),
        giorni: g,
        costo: s.costo,
        periodicita: s.periodicita,
        referente: s.referente,
        cartaPagamento: s.cartaPagamento,
        rinnovoAutomatico: s.rinnovoAutomatico,
      })
      await patchSoftwareFields(s.spItemId, { AlertScadenzaNotificata: s.scadenza!.slice(0, 10) })
      inviati++
    }

    return NextResponse.json({ ok: true, candidati: daAvvisare.length, inviati })
  } catch (err: any) {
    console.error('[GET /api/cron/scadenze-software]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
