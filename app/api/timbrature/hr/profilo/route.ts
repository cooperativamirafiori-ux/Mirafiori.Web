/**
 * GET  /api/timbrature/hr/profilo?dipendenteId=N  — profili orari del dipendente
 * POST /api/timbrature/hr/profilo                  — imposta un profilo (solo HR)
 *   body: { dipendenteId, decorrenza, ore: {1..7} }
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardHr } from '@/lib/timbrature/guard'
import { getProfili, salvaProfilo } from '@/lib/timbrature/data'
import type { MonteOreSettimana } from '@/types/timbrature'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await guardHr()
  if (g.error) return g.error
  const dipendenteId = Number(new URL(req.url).searchParams.get('dipendenteId'))
  if (!dipendenteId) return NextResponse.json({ error: 'dipendenteId obbligatorio' }, { status: 400 })
  try {
    const profili = await getProfili(dipendenteId)
    return NextResponse.json({ profili })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await guardHr()
  if (g.error) return g.error
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const dipendenteId = Number(body?.dipendenteId)
  const decorrenza = String(body?.decorrenza ?? '').slice(0, 10)
  if (!dipendenteId || !/^\d{4}-\d{2}-\d{2}$/.test(decorrenza)) {
    return NextResponse.json({ error: 'dipendenteId e decorrenza (YYYY-MM-DD) obbligatori' }, { status: 400 })
  }
  const o = body?.ore ?? {}
  const ore: MonteOreSettimana = {
    1: Number(o[1]) || 0,
    2: Number(o[2]) || 0,
    3: Number(o[3]) || 0,
    4: Number(o[4]) || 0,
    5: Number(o[5]) || 0,
    6: Number(o[6]) || 0,
    7: Number(o[7]) || 0,
  }
  try {
    const profilo = await salvaProfilo({ dipendenteId, decorrenza, ore, aggiornatoDa: g.session.user.email! })
    return NextResponse.json({ profilo })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore salvataggio' }, { status: 400 })
  }
}
