/**
 * POST /api/inventario/[id]/documento — apre la sessione di upload di fattura o
 * garanzia nella cartella SharePoint del bene.
 *
 * Body JSON: { filename: string, dimensione?: number, tipo: 'fattura' | 'garanzia' }
 * Risposta:  { uploadUrl, scadeIl, nomeFile }
 *
 * Il browser fa poi il PUT diretto a SharePoint e chiama
 * POST /api/inventario/[id]/documento/conferma. I byte non passano da Vercel,
 * quindi non vale il limite dei 4 MB dell'upload semplice di Graph.
 *
 * Protetta: area "Acquisti".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { AREA_ACQUISTI } from '@/lib/acquisti/data'
import {
  creaSessioneUploadDocumento,
  getBeneById,
  inventarioConfigurato,
} from '@/lib/inventario/data'
import { MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/core/upload-diretto'
import { TIPI_DOCUMENTO, type TipoDocumento } from '@/types/inventario'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA_ACQUISTI)
  if (g.error) return g.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID bene mancante' }, { status: 400 })
  if (!inventarioConfigurato()) {
    return NextResponse.json({ error: 'Inventario non configurato' }, { status: 503 })
  }

  let body: { filename?: string; dimensione?: number; tipo?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso JSON)' }, { status: 400 })
  }

  const filename = (body.filename ?? '').trim()
  if (!filename) return NextResponse.json({ error: 'Nome file mancante' }, { status: 400 })

  const tipo = body.tipo as TipoDocumento
  if (!TIPI_DOCUMENTO.includes(tipo)) {
    return NextResponse.json({ error: 'Tipo documento non valido' }, { status: 400 })
  }
  if (typeof body.dimensione === 'number' && body.dimensione > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File troppo grande (max ${maxUploadMb()} MB)` },
      { status: 413 },
    )
  }

  try {
    const bene = await getBeneById(id)
    const sessione = await creaSessioneUploadDocumento(bene, tipo, filename)
    return NextResponse.json(sessione)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore apertura caricamento' },
      { status: 500 },
    )
  }
}
