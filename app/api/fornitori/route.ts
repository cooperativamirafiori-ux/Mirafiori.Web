/** POST /api/fornitori — nuovo fornitore nell'anagrafica di Manutenzioni. Solo admin. */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { logAzione } from '@/lib/core/audit'
import { creaFornitore } from '@/lib/fornitori/data'
import { leggiDatiFornitore } from '@/types/fornitori'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  if (!session.user.isAdmin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const r = leggiDatiFornitore(await req.json().catch(() => ({})))
  if ('problemi' in r) return NextResponse.json({ error: r.problemi.join('. ') }, { status: 400 })
  try {
    const id = await creaFornitore(r.dati)
    await logAzione({ utente: session.user.email, azione: 'fornitori.crea', entita: 'Fornitore', entitaId: id, dettagli: { nome: r.dati.nome } })
    return NextResponse.json({ id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
