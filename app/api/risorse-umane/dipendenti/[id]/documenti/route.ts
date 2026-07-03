/**
 * POST /api/risorse-umane/dipendenti/[id]/documenti — carica un documento
 * (multipart/form-data, campo "file", < 4 MB) nella cartella personale.
 *
 * Protetta dal permesso "Risorse Umane".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/api-guard'
import { AREA_RU } from '@/lib/ru-api'
import { caricaDocumentoDipendente } from '@/lib/risorse-umane'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 4 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardArea(AREA_RU)
  if (g.error) return g.error
  const { id } = await params

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Form non valido' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File mancante' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File troppo grande (max 4 MB)' }, { status: 400 })
  }

  try {
    const buf = await file.arrayBuffer()
    const documento = await caricaDocumentoDipendente(id, file.name, buf, file.type || undefined)
    return NextResponse.json({ documento })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore upload' },
      { status: 500 },
    )
  }
}
