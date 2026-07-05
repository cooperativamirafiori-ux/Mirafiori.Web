/**
 * POST /api/timbrature/hr/riapri
 *   body: { dipendenteId, anno, mese }
 * Riapre un mese chiuso (solo HR), per consentire correzioni.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardHr } from '@/lib/timbrature-guard'
import { riapriMese } from '@/lib/timbrature'

export const dynamic = 'force-dynamic'

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
  const anno = Number(body?.anno)
  const mese = Number(body?.mese)
  if (!dipendenteId || !anno || !mese) {
    return NextResponse.json({ error: 'dipendenteId, anno, mese obbligatori' }, { status: 400 })
  }
  try {
    const chiusura = await riapriMese(dipendenteId, anno, mese)
    return NextResponse.json({ chiusura })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
