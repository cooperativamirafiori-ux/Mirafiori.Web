/**
 * GET /api/cron/fatture-sdi — giro notturno dell'import delle fatture XML.
 *
 * Legge la cartella SharePoint delle fatture, crea le scadenze nei Flussi
 * fatture e sposta i file in "Importate". Idempotente: rigirarlo non duplica
 * niente, e i file già letti non ci sono più.
 *
 * Sicurezza: Vercel allega `Authorization: Bearer ${CRON_SECRET}` se l'env è
 * impostata.
 */

import { NextRequest, NextResponse } from 'next/server'
import { importaFattureSdi } from '@/lib/pagamenti/sdi/import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }
  try {
    const ricevuta = await importaFattureSdi({ utente: 'cron fatture SDI', budgetMs: 240_000 })
    return NextResponse.json({ ok: true, ricevuta })
  } catch (e: any) {
    console.error('[cron fatture-sdi]', e)
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
