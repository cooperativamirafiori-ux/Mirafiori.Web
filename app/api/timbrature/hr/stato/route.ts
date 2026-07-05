/**
 * GET /api/timbrature/hr/stato?anno=YYYY&mese=M
 * Cruscotto HR: stato del mese per tutti i dipendenti attivi.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardHr } from '@/lib/timbrature-guard'
import { statoMeseTutti } from '@/lib/timbrature'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await guardHr()
  if (g.error) return g.error
  const { searchParams } = new URL(req.url)
  const anno = Number(searchParams.get('anno'))
  const mese = Number(searchParams.get('mese'))
  if (!anno || !mese) return NextResponse.json({ error: 'anno/mese obbligatori' }, { status: 400 })
  try {
    const dipendenti = await statoMeseTutti(anno, mese)
    return NextResponse.json({ dipendenti })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
