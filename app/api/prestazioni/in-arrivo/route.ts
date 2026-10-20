/**
 * POST /api/prestazioni/in-arrivo
 *
 * Apre la sessione di upload diretto per un documento d'identità caricato
 * PRIMA che la pratica esista (prestatore nuovo). Il file va in
 * `ROOT/_In arrivo/{lotto}`; al "Salva" viene spostato in
 * `{Cognome_Nome_CF}/Documenti Identità` (vedi `lib/prestazioni/in-arrivo.ts`).
 *
 * Body JSON: { lotto?: string, filename: string, dimensione?: number }
 *   lotto assente → ne crea uno nuovo (primo file del modulo)
 * Risposta:  { lotto, uploadUrl, scadeIl, nomeFile }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/core/upload-diretto'
import { apriSessioneInArrivo, lottoValido, nuovoLotto } from '@/lib/prestazioni/in-arrivo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ESTENSIONI_OK = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tif', 'tiff']

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  let body: { lotto?: unknown; filename?: string; dimensione?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso JSON)' }, { status: 400 })
  }

  if (body.lotto != null && !lottoValido(body.lotto)) {
    return NextResponse.json({ error: 'Lotto non valido' }, { status: 400 })
  }
  const lotto = lottoValido(body.lotto) ? body.lotto : nuovoLotto()

  const filename = (body.filename ?? '').trim()
  if (!filename) return NextResponse.json({ error: 'Nome file mancante' }, { status: 400 })
  if (typeof body.dimensione === 'number' && body.dimensione > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File troppo grande (max ${maxUploadMb()} MB)` }, { status: 413 })
  }
  const ext = (filename.includes('.') ? filename.split('.').pop() : '')!.toLowerCase()
  if (!ESTENSIONI_OK.includes(ext)) {
    return NextResponse.json(
      { error: `Formato non ammesso (.${ext || '?'}): usa PDF o una foto` },
      { status: 400 },
    )
  }

  try {
    const sessione = await apriSessioneInArrivo(lotto, filename)
    return NextResponse.json({ lotto, ...sessione })
  } catch (err: any) {
    console.error('[POST /api/prestazioni/in-arrivo]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
