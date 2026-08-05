/**
 * GET /api/timbrature/hr/stato?anno=YYYY&mese=M
 *
 * Cruscotto di validazione. Chi lo apre determina cosa vede:
 *   - Risorse Umane (permesso "Timbrature HR") → tutti i dipendenti;
 *   - responsabile (e' referente foglio ore di qualcuno) → solo i suoi.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardValidatore } from '@/lib/timbrature/guard'
import { statoMeseTutti } from '@/lib/timbrature/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await guardValidatore()
  if (g.error) return g.error
  const { searchParams } = new URL(req.url)
  const anno = Number(searchParams.get('anno'))
  const mese = Number(searchParams.get('mese'))
  if (!anno || !mese) return NextResponse.json({ error: 'anno/mese obbligatori' }, { status: 400 })
  try {
    const dipendenti = await statoMeseTutti(anno, mese, g.v.referente)
    return NextResponse.json({ dipendenti, ruolo: g.v.hr ? 'hr' : 'responsabile' })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
