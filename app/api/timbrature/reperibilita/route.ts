/**
 * GET  /api/timbrature/reperibilita?from=YYYY-MM-DD&to=YYYY-MM-DD
 *      → { giorni: string[] }  date dichiarate di reperibilita'
 * POST /api/timbrature/reperibilita   body: { data, attiva }
 *
 * "Giornata di reperibilita'": la spunta si mette anche senza ore lavorate.
 * Il dipendente agisce solo su di se', con la finestra delle ore di lavoro
 * (oggi e i due giorni precedenti). Vedi lib/timbrature/reperibilita.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardOperatore } from '@/lib/timbrature/guard'
import { impostaReperibilita, listGiornateReperibilita } from '@/lib/timbrature/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await guardOperatore()
  if (g.error) return g.error
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) {
    return NextResponse.json({ error: 'Parametri from/to obbligatori' }, { status: 400 })
  }
  try {
    const giorni = await listGiornateReperibilita(g.dipendente.id, from, to)
    return NextResponse.json({ giorni })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore lettura' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await guardOperatore()
  if (g.error) return g.error
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  if (!body?.data) return NextResponse.json({ error: 'Data obbligatoria' }, { status: 400 })
  try {
    await impostaReperibilita(g.dipendente.id, String(body.data), !!body.attiva, g.session.user.email!)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore salvataggio' }, { status: 400 })
  }
}
