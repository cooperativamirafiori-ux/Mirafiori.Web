/**
 * GET /api/timbrature/hr/dipendente/[id]?anno=YYYY&mese=M
 * Dettaglio di un dipendente per il controllo prima della validazione:
 * righe del mese + riepilogo + profilo vigente + stato della chiusura.
 *
 * Il responsabile puo' aprire solo le schede dei propri collaboratori.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardValidatore, puoAgireSu } from '@/lib/timbrature/guard'
import {
  getDipendenteById,
  listTimbrature,
  riepilogoPeriodo,
  getProfili,
  getChiusura,
  getServizi,
  getProgetti,
  primoUltimoGiorno,
} from '@/lib/timbrature/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardValidatore()
  if (g.error) return g.error
  const { id } = await params
  const dipId = Number(id)
  const { searchParams } = new URL(req.url)
  const anno = Number(searchParams.get('anno'))
  const mese = Number(searchParams.get('mese'))
  if (!dipId || !anno || !mese) return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 })

  const negato = await puoAgireSu(g.v, dipId)
  if (negato) return NextResponse.json({ error: negato }, { status: 403 })

  try {
    const dip = await getDipendenteById(dipId)
    if (!dip) return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
    const { from, to } = primoUltimoGiorno(anno, mese)
    const [timbrature, riepilogo, profili, chiusura, servizi, progetti] = await Promise.all([
      listTimbrature(dipId, from, to),
      riepilogoPeriodo(dipId, from, to),
      getProfili(dipId),
      getChiusura(dipId, anno, mese),
      getServizi(true),
      getProgetti(true),
    ])
    // Il token non esce mai dal server: e' la chiave del link di conferma.
    const sicura = chiusura ? { ...chiusura, token: undefined } : null
    return NextResponse.json({
      dipendente: dip,
      timbrature,
      riepilogo,
      profili,
      chiusura: sicura,
      servizi,
      progetti,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
