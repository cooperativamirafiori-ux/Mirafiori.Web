/**
 * PATCH  /api/software/[id]  — aggiorna un software (id = ID riga SP)
 * DELETE /api/software/[id]  — elimina un software
 *
 * Protette: solo chi ha il permesso "Amministrazione".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { aggiornaSoftware, eliminaSoftware } from '@/lib/software/data'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'

function parseInput(body: Record<string, any>) {
  const costoNum =
    body.costo === '' || body.costo == null ? null : Number(body.costo)
  const centroCostoId = Number(body.centroCostoId ?? 0)
  return {
    servizio: (body.servizio ?? '').trim(),
    categoria: (body.categoria ?? '').trim(),
    centroCostoId: Number.isFinite(centroCostoId) && centroCostoId > 0 ? centroCostoId : 0,
    account: (body.account ?? '').trim(),
    password: body.password ?? '',
    linkPortale: (body.linkPortale ?? '').trim(),
    referente: (body.referente ?? '').trim(),
    costo: Number.isFinite(costoNum) ? costoNum : null,
    periodicita: (body.periodicita ?? '').trim(),
    rinnovoAutomatico: !!body.rinnovoAutomatico,
    scadenza: (body.scadenza ?? '') || null,
    cartaPagamento: (body.cartaPagamento ?? '').trim(),
    stato: (body.stato ?? 'Attivo').trim() || 'Attivo',
    note: (body.note ?? '').trim(),
    calendarEmails: (body.calendarEmails ?? '').trim(),
  }
}

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

  const input = parseInput(body)
  if (!input.servizio) {
    return NextResponse.json({ error: 'Il nome del servizio è obbligatorio' }, { status: 400 })
  }
  if (!input.centroCostoId) {
    return NextResponse.json({ error: 'Il centro di costo è obbligatorio' }, { status: 400 })
  }

  try {
    const software = await aggiornaSoftware(id, input)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'software.aggiorna',
      entita: 'Software',
      entitaId: id,
      dettagli: { servizio: input.servizio },
    })
    return NextResponse.json({ software })
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
    await eliminaSoftware(id)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'software.elimina',
      entita: 'Software',
      entitaId: id,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore eliminazione' },
      { status: 500 },
    )
  }
}
