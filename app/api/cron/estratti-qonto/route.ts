/**
 * GET /api/cron/estratti-qonto — ogni lunedì mattina, l'estratto della
 * settimana prima di tutti i conti Qonto, in Excel, ad Alessandro.
 * Vedi lib/qonto/estratto.ts e docs/estratti-qonto.md.
 *
 * Parametri (solo con il CRON_SECRET, li usa scripts/estratto-qonto.mjs):
 *   ?settimana=YYYY-MM-DD  un giorno qualsiasi della settimana da mandare
 *   ?a=email[,email]       destinatari diversi (invio di prova)
 *
 * Sicurezza: Bearer CRON_SECRET, come gli altri cron.
 */

import { NextRequest, NextResponse } from 'next/server'
import { qontoConfigurato } from '@/lib/qonto/client'
import { preparaEstratto, settimanaDi, settimanaPrecedente } from '@/lib/qonto/estratto'
import { mandaEstratto } from '@/lib/qonto/notifiche'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }
  if (!qontoConfigurato()) return NextResponse.json({ ok: true, salto: 'Qonto non configurato' })

  const giorno = req.nextUrl.searchParams.get('settimana') ?? ''
  if (giorno && !/^\d{4}-\d{2}-\d{2}$/.test(giorno)) {
    return NextResponse.json({ error: 'settimana: usa YYYY-MM-DD' }, { status: 400 })
  }
  const a = (req.nextUrl.searchParams.get('a') ?? '').split(/[;,\s]+/).filter((x) => x.includes('@'))

  try {
    const settimana = giorno ? settimanaDi(giorno) : settimanaPrecedente()
    const estratto = await preparaEstratto(settimana)
    const destinatari = await mandaEstratto(estratto, a)
    return NextResponse.json({
      ok: true,
      dal: settimana.dal,
      al: settimana.al,
      conti: estratto.righe.length,
      movimenti: estratto.righe.reduce((n, r) => n + r.movimenti.length, 0),
      destinatari,
    })
  } catch (e) {
    console.error('[cron/estratti-qonto]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'errore' }, { status: 500 })
  }
}
