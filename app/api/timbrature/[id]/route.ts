/**
 * PATCH  /api/timbrature/[id]  — aggiorna una riga dell'operatore
 * DELETE /api/timbrature/[id]  — elimina una riga dell'operatore
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardOperatore } from '@/lib/timbrature/guard'
import { aggiornaTimbratura, eliminaTimbratura, leggiRiga } from '@/lib/timbrature/data'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardOperatore()
  if (g.error) return g.error
  const { id } = await params
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
    const esito = await aggiornaTimbratura(g.dipendente.id, id, leggiRiga(body), g.session.user.email!)
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore aggiornamento' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardOperatore()
  if (g.error) return g.error
  const { id } = await params
  try {
    await eliminaTimbratura(g.dipendente.id, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore eliminazione' }, { status: 400 })
  }
}
