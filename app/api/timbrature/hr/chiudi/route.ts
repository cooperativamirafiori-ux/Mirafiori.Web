/**
 * POST /api/timbrature/hr/chiudi
 *   body: { dipendenteId, anno, mese }
 * Genera il foglio ore Excel, lo carica nella cartella personale del dipendente
 * e marca il mese come chiuso. Solo HR, un dipendente alla volta.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardHr } from '@/lib/timbrature-guard'
import { getDipendenteById, chiudiMese } from '@/lib/timbrature'
import { pubblicaFoglioOre } from '@/lib/foglio-ore-xlsx'
import { graphRU } from '@/lib/graph-delegato'

export const runtime = 'nodejs'
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
    const dip = await getDipendenteById(dipendenteId)
    if (!dip) return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
    // Il foglio ore finisce nella cartella personale RU: passiamo il client con
    // l'identità dell'utente HR, così la scrittura risulta fatta da lui.
    const gc = await graphRU(g.session.user.email)
    const fileUrl = await pubblicaFoglioOre(dip, anno, mese, gc)
    const chiusura = await chiudiMese(dipendenteId, anno, mese, g.session.user.email!, fileUrl)
    return NextResponse.json({ chiusura })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore chiusura' }, { status: 500 })
  }
}
