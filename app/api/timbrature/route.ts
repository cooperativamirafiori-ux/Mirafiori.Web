/**
 * GET  /api/timbrature?from=YYYY-MM-DD&to=YYYY-MM-DD  — righe dell'operatore
 * POST /api/timbrature                                — crea una riga
 *
 * Area: "Timbrature". L'operatore agisce sempre e solo sulle proprie righe.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardOperatore } from '@/lib/timbrature-guard'
import { listTimbrature, creaTimbratura } from '@/lib/timbrature'

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
    const timbrature = await listTimbrature(g.dipendente.id, from, to)
    return NextResponse.json({ timbrature })
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
  if (!body?.data || !body?.servizioId) {
    return NextResponse.json({ error: 'Data e servizio obbligatori' }, { status: 400 })
  }
  try {
    const timbratura = await creaTimbratura(
      g.dipendente.id,
      {
        data: String(body.data).slice(0, 10),
        servizioId: Number(body.servizioId),
        oraInizio: body.oraInizio ?? null,
        oraFine: body.oraFine ?? null,
        notte: !!body.notte,
        mutua: !!body.mutua,
        note: body.note ?? null,
      },
      g.session.user.email!,
    )
    return NextResponse.json({ timbratura })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore salvataggio' }, { status: 400 })
  }
}
