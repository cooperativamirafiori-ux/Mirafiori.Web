/** PATCH /api/fornitori/[id] — modifica di un fornitore. Solo admin. */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { logAzione } from '@/lib/core/audit'
import { aggiornaFornitore } from '@/lib/fornitori/data'
import { leggiDatiFornitore } from '@/types/fornitori'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  if (!session.user.isAdmin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const id = Number((await params).id)
  const r = leggiDatiFornitore(await req.json().catch(() => ({})))
  if (!id || 'problemi' in r) {
    return NextResponse.json({ error: 'problemi' in r ? r.problemi.join('. ') : 'id mancante' }, { status: 400 })
  }
  try {
    await aggiornaFornitore(id, r.dati)
    await logAzione({ utente: session.user.email, azione: 'fornitori.modifica', entita: 'Fornitore', entitaId: id, dettagli: { nome: r.dati.nome } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
