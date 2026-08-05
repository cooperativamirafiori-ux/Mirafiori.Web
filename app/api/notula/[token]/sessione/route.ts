/**
 * POST /api/notula/[token]/sessione — endpoint PUBBLICO (token), NON richiede login.
 *
 * Apre la sessione di upload su SharePoint per la notula firmata e ritorna
 * l'URL pre-autorizzato: il prestatore carica direttamente dal browser, senza
 * far passare il file da Vercel (quindi senza il limite dei 4 MB).
 *
 * Body JSON: { filename: string, dimensione?: number, contentType?: string }
 * Risposta:  { uploadUrl, scadeIl, nomeFile }
 *
 * Sicurezza — questo endpoint consegna un URL scrivibile a un utente NON
 * autenticato, quindi:
 *   - la sessione si apre solo dopo che il token è stato validato;
 *   - il nome del file e la cartella li decide il server: il prestatore può
 *     influenzare soltanto l'estensione, scelta da una whitelist;
 *   - l'URL della sessione non viene mai scritto nei log;
 *   - la sessione scade da sola (ore, non giorni) e vale per quel solo file.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getPrestazioneByToken,
  ensureCartellaPrestazione,
  creaSessioneUpload,
} from '@/lib/prestazioni/data'
import { MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/core/upload-diretto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Estensioni ammesse per la notula firmata (PDF, scansione o Word) */
const ESTENSIONI_OK = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'tif', 'tiff', 'docx']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const p = await getPrestazioneByToken(token).catch(() => null)
  if (!p) return NextResponse.json({ error: 'Link non valido o scaduto' }, { status: 404 })

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

  const ext = (filename.includes('.') ? filename.split('.').pop() : 'pdf')!.toLowerCase()
  if (!ESTENSIONI_OK.includes(ext)) {
    return NextResponse.json(
      { error: 'Formato non ammesso (PDF, immagine o Word)' },
      { status: 400 },
    )
  }

  try {
    const { prestazione: cartella } = await ensureCartellaPrestazione({
      nome: p.nome,
      cognome: p.cognome,
      codiceFiscale: p.codiceFiscale,
      dataCartella: p.dataInserimento,
    })

    const sessione = await creaSessioneUpload(
      cartella.path,
      `${p.idPrestazione}_Notula_firmata.${ext}`,
    )

    return NextResponse.json(sessione)
  } catch (err: any) {
    // Attenzione: non loggare mai `sessione.uploadUrl`.
    console.error('[POST /api/notula/[token]/sessione]', err?.message ?? err)
    return NextResponse.json({ error: 'Errore apertura caricamento' }, { status: 500 })
  }
}
