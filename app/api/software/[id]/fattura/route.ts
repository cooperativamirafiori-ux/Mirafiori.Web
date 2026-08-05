/**
 * POST /api/software/[id]/fattura — apre la sessione di upload della fattura.
 *
 * Body JSON: { filename: string, dimensione?: number }
 * Risposta:  { uploadUrl, scadeIl, nomeFile }
 *
 * Il browser fa poi il PUT diretto a SharePoint e chiama
 * POST /api/software/[id]/fattura/conferma. Il file non passa più da Vercel,
 * quindi non vale più il limite dei 4 MB dell'upload semplice di Graph.
 *
 * Protetta: solo chi ha il permesso "Amministrazione".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { getSoftwareById, creaSessioneUploadFattura } from '@/lib/software'
import { MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/core/upload-diretto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA)
  if (g.error) return g.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })

  let body: { filename?: string; dimensione?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso JSON)' }, { status: 400 })
  }

  const filename = (body.filename ?? '').trim()
  if (!filename) {
    return NextResponse.json({ error: 'Nome file mancante' }, { status: 400 })
  }
  if (typeof body.dimensione === 'number' && body.dimensione > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File troppo grande (max ${maxUploadMb()} MB)` },
      { status: 413 },
    )
  }

  try {
    const sw = await getSoftwareById(id)
    const sessione = await creaSessioneUploadFattura(sw.servizio || 'software', filename)
    return NextResponse.json(sessione)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore apertura caricamento fattura' },
      { status: 500 },
    )
  }
}
