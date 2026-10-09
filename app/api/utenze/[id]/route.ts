/**
 * PATCH /api/utenze/[id] — modifica una riga della Mappatura Utenze.
 * `riapplica: true` riscrive anche la divisione delle bollette già registrate
 * di quel codice; senza, vale solo per le bollette future e quelle in attesa.
 *
 * DELETE /api/utenze/[id] — toglie la riga dalla Mappatura. Le bollette già
 * divise restano dove sono (la struttura è copiata sulla quota); quelle che
 * arriveranno con quel codice finiscono in "Da collegare".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { aggiornaUtenza, collegaCodice, eliminaUtenzaSp, getMappatura } from '@/lib/utenze/data'
import { AREA_AMMINISTRAZIONE, leggiDatiMappatura } from '@/types/utenze'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardArea(AREA_AMMINISTRAZIONE)
  if (g.error) return g.error
  const id = Number((await params).id)
  const body = await req.json().catch(() => ({}))
  const r = leggiDatiMappatura(body)
  if (!id || 'problemi' in r) return NextResponse.json({ error: 'problemi' in r ? r.problemi.join('. ') : 'id mancante' }, { status: 400 })
  try {
    await aggiornaUtenza(id, r.dati)
    const collegate = await collegaCodice(r.dati.codice, g.session.user.email!, body.riapplica === true)
    await logAzione({ utente: g.session.user.email, azione: 'utenze.modifica', entita: 'Utenza', entitaId: id, dettagli: { ...r.dati, riapplica: body.riapplica === true, collegate } })
    return NextResponse.json({ ok: true, collegate })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardArea(AREA_AMMINISTRAZIONE)
  if (g.error) return g.error
  const id = Number((await params).id)
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 })
  try {
    const riga = (await getMappatura()).find((m) => m.id === id)
    if (!riga) return NextResponse.json({ error: 'Utenza non trovata' }, { status: 404 })
    await eliminaUtenzaSp(id)
    await logAzione({ utente: g.session.user.email, azione: 'utenze.elimina', entita: 'Utenza', entitaId: id, dettagli: riga })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
