/**
 * PATCH  /api/timbrature/hr/riga/[id]  — corregge una riga per conto del dipendente
 * DELETE /api/timbrature/hr/riga/[id]?dipendenteId=N
 *
 * Stesse regole di POST /api/timbrature/hr/riga: solo sui propri collaboratori
 * (le HR su tutti) e solo finche' il foglio non e' stato validato.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardValidatore, puoAgireSu } from '@/lib/timbrature-guard'
import { aggiornaTimbratura, eliminaTimbratura } from '@/lib/timbrature'
import { logAzione } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardValidatore()
  if (g.error) return g.error
  const { id } = await params
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const dipendenteId = Number(body?.dipendenteId)
  if (!dipendenteId || !body?.data || !body?.servizioId) {
    return NextResponse.json({ error: 'dipendenteId, data e servizio obbligatori' }, { status: 400 })
  }
  const negato = await puoAgireSu(g.v, dipendenteId)
  if (negato) return NextResponse.json({ error: negato }, { status: 403 })

  try {
    const timbratura = await aggiornaTimbratura(
      dipendenteId,
      id,
      {
        data: String(body.data).slice(0, 10),
        servizioId: Number(body.servizioId),
        oraInizio: body.oraInizio ?? null,
        oraFine: body.oraFine ?? null,
        mutua: !!body.mutua,
        note: body.note ?? null,
      },
      g.v.email,
      { perConto: true },
    )
    await logAzione({
      utente: g.v.email,
      nome: g.v.session.user.name,
      azione: 'timbrature.riga-per-conto-modifica',
      entita: 'Timbratura',
      entitaId: id,
      dettagli: { dipendenteId, data: timbratura.data, ore: timbratura.ore },
    })
    return NextResponse.json({ timbratura })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore aggiornamento' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardValidatore()
  if (g.error) return g.error
  const { id } = await params
  const dipendenteId = Number(new URL(req.url).searchParams.get('dipendenteId'))
  if (!dipendenteId) return NextResponse.json({ error: 'dipendenteId obbligatorio' }, { status: 400 })
  const negato = await puoAgireSu(g.v, dipendenteId)
  if (negato) return NextResponse.json({ error: negato }, { status: 403 })
  try {
    await eliminaTimbratura(dipendenteId, id, { perConto: true })
    await logAzione({
      utente: g.v.email,
      nome: g.v.session.user.name,
      azione: 'timbrature.riga-per-conto-elimina',
      entita: 'Timbratura',
      entitaId: id,
      dettagli: { dipendenteId },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore eliminazione' }, { status: 400 })
  }
}
