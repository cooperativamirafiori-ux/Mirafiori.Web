/**
 * POST /api/risorse-umane/dipendenti/[id]/documenti — carica un documento
 * (multipart/form-data, campo "file", < 4 MB) nella cartella personale.
 *
 * Accesso: membri del gruppo Microsoft 365 "Risorse Umane" (vedi lib/gruppo-ru.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardMembroRU } from '@/lib/api-guard'
import { caricaDocumentoDipendente } from '@/lib/risorse-umane'
import { graphRU } from '@/lib/graph-delegato'
import { logAzione } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 4 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMembroRU()
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

  // Categoria (facoltativa): prefissa il nome del file, es. "Contratto - <nome>.pdf"
  const categoria = String(form.get('categoria') ?? '').trim()
  const nomeFile = categoria ? `${categoria} - ${file.name}` : file.name

  try {
    const buf = await file.arrayBuffer()
    const gc = await graphRU(g.session.user.email)
    const documento = await caricaDocumentoDipendente(gc, id, nomeFile, buf, file.type || undefined)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'ru.dipendente.documento-carica',
      entita: 'dipendente',
      entitaId: id,
      dettagli: { file: nomeFile },
    })
    return NextResponse.json({ documento })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore upload' },
      { status: 500 },
    )
  }
}
