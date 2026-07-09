/**
 * Endpoint PUBBLICO (token monouso) per il caricamento della notula firmata
 * da parte del prestatore — NON richiede login.
 *
 *   GET  /api/notula/[token]  → valida il token e ritorna dati minimi (per la pagina)
 *   POST /api/notula/[token]  → riceve il file (FormData "notula"), lo salva nella
 *                               cartella SharePoint, stato → "Notula ricevuta" e
 *                               notifica info@ + Claudia + responsabile.
 *
 * La sicurezza è data dal token: imprevedibile, legato alla singola pratica.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getPrestazioneByToken,
  aggiornaPrestazione,
  ensureCartellaPrestazione,
  uploadAllegato,
} from '@/lib/prestazioni'
import { notificaNotulaCaricata } from '@/lib/notifications'
import { logAzione } from '@/lib/audit'

export const runtime = 'nodejs'

const MAX_FILE_BYTES = 4 * 1024 * 1024
const ALLOWED = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const p = await getPrestazioneByToken(token).catch(() => null)
  if (!p) return NextResponse.json({ error: 'Link non valido o scaduto' }, { status: 404 })
  return NextResponse.json({
    idPrestazione: p.idPrestazione,
    prestatoreNome: `${p.cognome} ${p.nome}`.trim(),
    giaCaricata: !!p.notulaUrl,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const p = await getPrestazioneByToken(token).catch(() => null)
  if (!p) return NextResponse.json({ error: 'Link non valido o scaduto' }, { status: 404 })

  let fd: FormData
  try {
    fd = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const file = fd.get('notula')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Nessun file ricevuto' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File troppo grande (max 4 MB)' }, { status: 400 })
  }
  if (file.type && !ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Formato non ammesso (PDF, immagine o Word)' }, { status: 400 })
  }

  try {
    const { prestazione: cartella } = await ensureCartellaPrestazione({
      nome: p.nome,
      cognome: p.cognome,
      codiceFiscale: p.codiceFiscale,
      dataCartella: p.dataInserimento,
    })

    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf'
    const buf = new Uint8Array(await file.arrayBuffer())
    const { webUrl } = await uploadAllegato(
      cartella.path,
      `${p.idPrestazione}_Notula_firmata.${ext}`,
      buf,
      file.type || 'application/octet-stream',
    )

    await aggiornaPrestazione(p.spItemId, { NotulaUrl: webUrl, Stato: 'Notula ricevuta' })

    await notificaNotulaCaricata({
      idPrestazione: p.idPrestazione,
      prestatoreNome: `${p.cognome} ${p.nome}`.trim(),
      responsabileEmail: p.responsabileEmail,
      notulaUrl: webUrl,
      cartellaUrl: p.cartellaUrl,
    }).catch((e) => console.error('[notula] invio notifica fallito', e))

    await logAzione({
      utente: p.email || '(prestatore esterno)',
      nome: `${p.cognome} ${p.nome}`.trim(),
      azione: 'prestazione.notula-caricata',
      entita: 'PrestazioneOccasionale',
      entitaId: p.idPrestazione,
      dettagli: { origine: 'esterno via token' },
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/notula/[token]]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
