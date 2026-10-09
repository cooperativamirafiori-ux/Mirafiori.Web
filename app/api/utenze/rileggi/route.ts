/**
 * POST /api/utenze/rileggi — rilegge per le utenze gli XML delle fatture già
 * importate. Ripetibile: se il tempo non basta, si preme di nuovo e riparte
 * da dove era rimasto.
 */

import { NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { rileggiUtenze } from '@/lib/pagamenti/sdi/import'
import { AREA_AMMINISTRAZIONE } from '@/types/utenze'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const g = await guardArea(AREA_AMMINISTRAZIONE)
  if (g.error) return g.error
  try {
    const esito = await rileggiUtenze({ budgetMs: 240_000 })
    await logAzione({ utente: g.session.user.email, azione: 'utenze.rileggi', entita: 'Utenze', dettagli: esito })
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
