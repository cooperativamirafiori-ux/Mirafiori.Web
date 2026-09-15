/**
 * PATCH  /api/password/[id]  — aggiorna una voce (id = ID riga SP)
 * DELETE /api/password/[id]  — elimina una voce
 *
 * Protette: solo chi ha il permesso "Amministrazione".
 *
 * ⚠️ Nel log attività non finisce mai né la password né il PIN. Sul cambio si
 * registra il fatto ("passwordCambiata: true"), non il valore.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import {
  getVocePassword,
  aggiornaVocePassword,
  eliminaVocePassword,
  parseInputPassword,
} from '@/lib/password/data'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA)
  if (g.error) return g.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const input = parseInputPassword(body)
  if (!input.nome) {
    return NextResponse.json({ error: 'Il nome della voce è obbligatorio' }, { status: 400 })
  }

  try {
    const prima = await getVocePassword(id)
    const voce = await aggiornaVocePassword(id, input)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'password.aggiorna',
      entita: 'VocePassword',
      entitaId: id,
      dettagli: {
        nome: voce.nome,
        passwordCambiata: input.password !== prima.password,
      },
    })
    return NextResponse.json({ voce })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore aggiornamento' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA)
  if (g.error) return g.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })

  try {
    // Si legge prima di cancellare, così nel log resta scritto *cosa* è sparito:
    // dopo la DELETE il nome non lo recupera più nessuno.
    let nome = ''
    try {
      nome = (await getVocePassword(id)).nome
    } catch {
      // voce già sparita o non leggibile: si procede comunque
    }
    await eliminaVocePassword(id)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'password.elimina',
      entita: 'VocePassword',
      entitaId: id,
      dettagli: { nome },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore eliminazione' },
      { status: 500 },
    )
  }
}
