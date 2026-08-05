/**
 * DELETE /api/permessi/[id] — revoca un'autorizzazione (id = ID riga SP)
 *
 * Protetta: solo chi ha il permesso "Amministrazione".
 */

import { NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { rimuoviAutorizzazione } from '@/lib/core/permessi'
import { logAzione } from '@/lib/core/audit'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guardArea('Amministrazione')
  if (g.error) return g.error

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'ID mancante' }, { status: 400 })
  }

  try {
    await rimuoviAutorizzazione(id)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'permesso.revoca',
      entita: 'Autorizzazione',
      entitaId: id,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore revoca' },
      { status: 500 }
    )
  }
}
