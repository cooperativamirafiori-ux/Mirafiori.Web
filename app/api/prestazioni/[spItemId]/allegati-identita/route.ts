/**
 * POST /api/prestazioni/[spItemId]/allegati-identita
 *
 * Apre una sessione di upload su SharePoint per un documento d'identità del
 * prestatore e ritorna l'URL pre-autorizzato: il browser fa il PUT direttamente,
 * senza far passare i byte da Vercel (quindi senza il limite dei 4 MB).
 *
 * Body JSON: { tipo: 'cf' | 'ci', filename: string, dimensione?: number }
 * Risposta:  { uploadUrl, scadeIl, nomeFile }
 *
 * Il nome finale e la cartella li decide il server partendo dal record della
 * pratica: il client non può scegliere dove scrivere.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  getPrestazioneById,
  ensureCartellaDocumentiIdentita,
  creaSessioneUpload,
} from '@/lib/prestazioni'
import { MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/upload-diretto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Estensioni ammesse per una scansione di documento d'identità */
const ESTENSIONI_OK = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'tif', 'tiff']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> },
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const { spItemId } = await params
  if (!spItemId) {
    return NextResponse.json({ error: 'ID prestazione mancante' }, { status: 400 })
  }

  let body: { tipo?: string; filename?: string; dimensione?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso JSON)' }, { status: 400 })
  }

  const tipo = body.tipo === 'cf' || body.tipo === 'ci' ? body.tipo : null
  if (!tipo) {
    return NextResponse.json({ error: 'Tipo documento non valido (cf | ci)' }, { status: 400 })
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

  const ext = (filename.includes('.') ? filename.split('.').pop() : 'pdf')!.toLowerCase()
  if (!ESTENSIONI_OK.includes(ext)) {
    return NextResponse.json(
      { error: `Formato non ammesso (.${ext}): usa PDF o un'immagine` },
      { status: 400 },
    )
  }

  try {
    const p = await getPrestazioneById(spItemId)
    const cartella = await ensureCartellaDocumentiIdentita({
      nome: p.nome,
      cognome: p.cognome,
      codiceFiscale: p.codiceFiscale,
    })

    const prefisso = tipo === 'cf' ? 'CodiceFiscale' : 'CartaIdentita'
    const sessione = await creaSessioneUpload(
      cartella.path,
      `${prefisso}_${p.codiceFiscale.toUpperCase()}.${ext}`,
    )

    return NextResponse.json(sessione)
  } catch (err: any) {
    console.error('[POST /api/prestazioni/[spItemId]/allegati-identita]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
