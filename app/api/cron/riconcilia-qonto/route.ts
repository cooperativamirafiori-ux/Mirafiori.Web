/**
 * GET /api/cron/riconcilia-qonto — riconciliazione Qonto ↔ fatture a richiesta,
 * dal terminale (scripts/riconcilia-qonto.mjs). NON è fra i cron di vercel.json:
 * il giro di ogni notte sta già in cron/fatture-sdi.
 *
 *   ?storico=1          una tantum: uscite da settembre 2026 (vedi riconciliaStorico)
 *   ?storico=1&prova=1  dice cosa farebbe, senza chiudere né archiviare niente
 *   (senza parametri)   il giro normale, uguale a quello notturno
 *
 * Sicurezza: `Authorization: Bearer ${CRON_SECRET}`, come gli altri cron.
 */

import { NextRequest, NextResponse } from 'next/server'
import { qontoConfigurato } from '@/lib/qonto/client'
import { riconciliaQonto, riconciliaStorico } from '@/lib/qonto/riconciliazione'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }
  if (!qontoConfigurato()) return NextResponse.json({ error: 'Qonto non configurato' }, { status: 503 })
  const q = req.nextUrl.searchParams
  try {
    const esito = q.get('storico') === '1'
      ? await riconciliaStorico({ prova: q.get('prova') === '1' })
      : await riconciliaQonto()
    return NextResponse.json({ ok: true, ...esito })
  } catch (e: any) {
    console.error('[riconcilia-qonto]', e)
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
