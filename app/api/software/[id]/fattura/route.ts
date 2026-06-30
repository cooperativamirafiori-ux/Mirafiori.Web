/**
 * POST /api/software/[id]/fattura — carica la fattura di un software.
 * Multipart form-data con campo "file". Max ~4 MB (upload semplice Graph).
 *
 * Protetta: solo chi ha il permesso "Amministrazione".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/api-guard'
import { getSoftwareById, caricaFattura } from '@/lib/software'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'
const MAX_BYTES = 4 * 1024 * 1024

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA)
  if (g.error) return g.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Form non valido' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Nessun file caricato' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File troppo grande (max 4 MB)' }, { status: 413 })
  }

  try {
    const sw = await getSoftwareById(id)
    const buffer = await file.arrayBuffer()
    const software = await caricaFattura(
      id,
      sw.servizio || 'software',
      file.name || 'fattura',
      buffer,
      file.type || 'application/octet-stream',
    )
    return NextResponse.json({ software })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore upload fattura' },
      { status: 500 },
    )
  }
}
