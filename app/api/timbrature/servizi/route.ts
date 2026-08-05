/**
 * GET /api/timbrature/servizi — elenco servizi attivi (operatore e HR).
 */

import { NextResponse } from 'next/server'
import { guardOperatore } from '@/lib/timbrature/guard'
import { getServizi } from '@/lib/timbrature/data'

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardOperatore()
  if (g.error) return g.error
  try {
    const servizi = await getServizi(true)
    return NextResponse.json({ servizi })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
