/**
 * GET /api/timbrature/hr/dipendente/[id]?anno=YYYY&mese=M
 * Dettaglio di un dipendente per il controllo HR prima della chiusura:
 * righe del mese + riepilogo + profilo vigente.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardHr } from '@/lib/timbrature-guard'
import {
  getDipendenteById,
  listTimbrature,
  riepilogoPeriodo,
  getProfili,
  getChiusura,
  primoUltimoGiorno,
} from '@/lib/timbrature'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardHr()
  if (g.error) return g.error
  const { id } = await params
  const dipId = Number(id)
  const { searchParams } = new URL(req.url)
  const anno = Number(searchParams.get('anno'))
  const mese = Number(searchParams.get('mese'))
  if (!dipId || !anno || !mese) return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 })
  try {
    const dip = await getDipendenteById(dipId)
    if (!dip) return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
    const { from, to } = primoUltimoGiorno(anno, mese)
    const [timbrature, riepilogo, profili, chiusura] = await Promise.all([
      listTimbrature(dipId, from, to),
      riepilogoPeriodo(dipId, from, to),
      getProfili(dipId),
      getChiusura(dipId, anno, mese),
    ])
    return NextResponse.json({ dipendente: dip, timbrature, riepilogo, profili, chiusura })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
