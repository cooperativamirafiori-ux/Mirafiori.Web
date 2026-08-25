/**
 * GET /api/timbrature/hr/progetti?dal=YYYY-MM-DD&al=YYYY-MM-DD
 *
 * Consuntivo ore per progetto sul periodo. Stessa visibilita' del cruscotto:
 * le HR vedono tutti, il responsabile solo i propri collaboratori.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardValidatore } from '@/lib/timbrature/guard'
import { orePerProgetto } from '@/lib/timbrature/data'

export const dynamic = 'force-dynamic'

const YMD = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const g = await guardValidatore()
  if (g.error) return g.error
  const { searchParams } = new URL(req.url)
  const dal = searchParams.get('dal') ?? ''
  const al = searchParams.get('al') ?? ''
  if (!YMD.test(dal) || !YMD.test(al)) {
    return NextResponse.json({ error: 'dal/al obbligatori (YYYY-MM-DD)' }, { status: 400 })
  }
  if (dal > al) {
    return NextResponse.json({ error: 'Il periodo finisce prima di iniziare' }, { status: 400 })
  }
  try {
    // `referente` e' gia' null per le HR: nessun filtro, vedono tutti.
    const progetti = await orePerProgetto(dal, al, g.v.referente)
    return NextResponse.json({ progetti, ruolo: g.v.hr ? 'hr' : 'responsabile' })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
