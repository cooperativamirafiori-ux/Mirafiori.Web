/**
 * DELETE /api/risorse-umane/dipendenti/[id]/documenti/[docId] — elimina un
 * documento dalla cartella personale (docId = ID drive item).
 *
 * Protetta dal permesso "Risorse Umane".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/api-guard'
import { AREA_RU } from '@/lib/ru-api'
import { eliminaDocumentoDipendente } from '@/lib/risorse-umane'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const g = await guardArea(AREA_RU)
  if (g.error) return g.error
  const { docId } = await params
  if (!docId) return NextResponse.json({ error: 'ID documento mancante' }, { status: 400 })
  try {
    await eliminaDocumentoDipendente(docId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore eliminazione documento' },
      { status: 500 },
    )
  }
}
