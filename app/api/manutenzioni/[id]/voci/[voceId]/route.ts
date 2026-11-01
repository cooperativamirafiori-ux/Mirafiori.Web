/**
 * Una riga delle "cose da fare" — solo la gestione.
 *
 * PATCH  { fatta: boolean } → spunta / toglie la spunta
 * DELETE                    → toglie la riga
 */

import { NextRequest, NextResponse } from 'next/server'
import { accessoPratica } from '@/lib/manutenzioni/accesso'
import { leggiVoce, spuntaVoce, eliminaVoce } from '@/lib/manutenzioni/pratica'
import { logAzione } from '@/lib/core/audit'

type Ctx = { params: Promise<{ id: string; voceId: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, voceId } = await params
  let body: { fatta?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  if (typeof body.fatta !== 'boolean') return NextResponse.json({ error: 'Valore non valido' }, { status: 400 })

  const a = await accessoPratica(id, 'gestione')
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })

  try {
    if (!(await leggiVoce(id, voceId))) return NextResponse.json({ error: 'Riga non trovata' }, { status: 404 })
    const voce = await spuntaVoce(id, voceId, body.fatta, a.email)
    await logAzione({
      utente: a.email,
      nome: a.nome,
      azione: body.fatta ? 'manutenzione.voce-fatta' : 'manutenzione.voce-riaperta',
      entita: 'RichiestaManutenzione',
      entitaId: a.richiesta.idRichiesta,
      dettagli: { testo: voce.testo },
    })
    return NextResponse.json({ ok: true, voce })
  } catch (e: any) {
    console.error(`[PATCH /api/manutenzioni/${id}/voci/${voceId}]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, voceId } = await params
  const a = await accessoPratica(id, 'gestione')
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })

  try {
    const voce = await leggiVoce(id, voceId)
    if (!voce) return NextResponse.json({ error: 'Riga non trovata' }, { status: 404 })
    await eliminaVoce(id, voceId)
    await logAzione({
      utente: a.email,
      nome: a.nome,
      azione: 'manutenzione.voce-tolta',
      entita: 'RichiestaManutenzione',
      entitaId: a.richiesta.idRichiesta,
      dettagli: { testo: voce.testo },
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error(`[DELETE /api/manutenzioni/${id}/voci/${voceId}]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
