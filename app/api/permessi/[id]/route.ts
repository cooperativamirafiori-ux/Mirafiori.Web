/**
 * DELETE /api/permessi/[id] — revoca un'autorizzazione (id = ID riga SP)
 *
 * Protetta: solo chi ha il permesso "Amministrazione".
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { rimuoviAutorizzazione } from '@/lib/sharepoint'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  if (!session.user.permessi?.includes('Amministrazione')) {
    return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'ID mancante' }, { status: 400 })
  }

  try {
    await rimuoviAutorizzazione(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore revoca' },
      { status: 500 }
    )
  }
}
