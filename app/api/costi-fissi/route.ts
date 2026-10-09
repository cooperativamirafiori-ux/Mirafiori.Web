/** POST /api/costi-fissi — nuovo costo fisso di una struttura. Solo "Amministrazione". */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { creaCostoFisso } from '@/lib/costi-fissi/data'
import { leggiDatiCostoFisso } from '@/types/costi-fissi'
import { AREA_AMMINISTRAZIONE } from '@/types/utenze'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await guardArea(AREA_AMMINISTRAZIONE)
  if (g.error) return g.error
  const r = leggiDatiCostoFisso(await req.json().catch(() => ({})))
  if ('problemi' in r) return NextResponse.json({ error: r.problemi.join('. ') }, { status: 400 })
  try {
    const id = await creaCostoFisso(r.dati)
    await logAzione({ utente: g.session.user.email, azione: 'costi-fissi.crea', entita: 'CostoFisso', entitaId: id, dettagli: r.dati })
    return NextResponse.json({ id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
