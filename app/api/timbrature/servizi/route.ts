/**
 * GET /api/timbrature/servizi — elenco servizi attivi (operatore e HR).
 *
 * Restituisce anche i progetti attivi: sono l'anagrafica gemella dei servizi,
 * serve a chi compila nello stesso momento, e una chiamata sola evita un
 * secondo giro di rete solo per riempire una tendina.
 */

import { NextResponse } from 'next/server'
import { guardOperatore } from '@/lib/timbrature/guard'
import { getProgetti, getServizi } from '@/lib/timbrature/data'

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardOperatore()
  if (g.error) return g.error
  try {
    const [servizi, progetti] = await Promise.all([getServizi(true), getProgetti(true)])
    return NextResponse.json({ servizi, progetti })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
