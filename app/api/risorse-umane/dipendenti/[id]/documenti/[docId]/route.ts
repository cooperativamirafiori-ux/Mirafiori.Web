/**
 * DELETE /api/risorse-umane/dipendenti/[id]/documenti/[docId] — elimina un
 * documento dalla cartella personale (docId = ID drive item).
 *
 * Accesso: membri del gruppo Microsoft 365 "Risorse Umane" (vedi lib/gruppo-ru.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardMembroRU } from '@/lib/core/api-guard'
import { eliminaDocumentoDipendente } from '@/lib/risorse-umane/data'
import { graphRU } from '@/lib/core/graph-delegato'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const g = await guardMembroRU()
  if (g.error) return g.error
  const { id, docId } = await params
  if (!docId) return NextResponse.json({ error: 'ID documento mancante' }, { status: 400 })
  try {
    const gc = await graphRU(g.session.user.email)
    await eliminaDocumentoDipendente(gc, docId)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'ru.dipendente.documento-elimina',
      entita: 'dipendente',
      entitaId: id,
      dettagli: { docId },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore eliminazione documento' },
      { status: 500 },
    )
  }
}
