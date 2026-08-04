/**
 * GET /api/timbrature/riepilogo?anno=YYYY&mese=M   (mese intero)
 *   oppure ?from=YYYY-MM-DD&to=YYYY-MM-DD          (settimana o intervallo)
 *
 * Ritorna il riepilogo dell'operatore + stato della finestra di correzione.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardOperatore } from '@/lib/timbrature-guard'
import type { FinestraMese } from '@/types/timbrature'
import { riepilogoPeriodo, finestraMese, primoUltimoGiorno, ultimoGiornoUtile } from '@/lib/timbrature'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await guardOperatore()
  if (g.error) return g.error
  const { searchParams } = new URL(req.url)
  const anno = searchParams.get('anno')
  const mese = searchParams.get('mese')
  let from = searchParams.get('from') ?? ''
  let to = searchParams.get('to') ?? ''

  try {
    let finestra: FinestraMese | undefined
    let scadenza: string | undefined
    if (anno && mese) {
      const p = primoUltimoGiorno(Number(anno), Number(mese))
      from = p.from
      to = p.to
      finestra = await finestraMese(g.dipendente.id, Number(anno), Number(mese))
      scadenza = ultimoGiornoUtile(Number(anno), Number(mese))
    }
    if (!from || !to) {
      return NextResponse.json({ error: 'Fornire anno+mese oppure from+to' }, { status: 400 })
    }
    const riepilogo = await riepilogoPeriodo(g.dipendente.id, from, to)
    return NextResponse.json({ riepilogo, finestra, scadenza })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
