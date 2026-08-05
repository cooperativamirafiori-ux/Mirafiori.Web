/**
 * POST /api/prestazioni/[spItemId]/notula
 * Fase chiusura: il responsabile inserisce l'importo lordo.
 *   1. Calcola ritenuta 20% / netto / bollo e genera la notula precompilata (.docx)
 *   2. La carica nella cartella SharePoint della prestazione
 *   3. Genera un token monouso e porta lo stato a "Notula inviata"
 *   4. Invia al prestatore la notula in allegato + il link "Carica notula"
 *
 * Body JSON: { importoLordo: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { auth } from '@/lib/core/auth'
import {
  getPrestazioneById,
  aggiornaPrestazione,
  ensureCartellaPrestazione,
  uploadAllegato,
} from '@/lib/prestazioni/data'
import { generaNotula, calcolaNotula } from '@/lib/prestazioni/documenti'
import { notificaNotulaAlPrestatore } from '@/lib/prestazioni/notifiche'
import { logAzione } from '@/lib/core/audit'

export const runtime = 'nodejs'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function baseUrl(req: NextRequest): string {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    req.nextUrl.origin
  ).replace(/\/$/, '')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> },
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const { spItemId } = await params
  let body: { importoLordo?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const importoLordo = Number(body.importoLordo)
  if (!Number.isFinite(importoLordo) || importoLordo <= 0) {
    return NextResponse.json({ error: 'Importo lordo non valido' }, { status: 400 })
  }

  try {
    const prestazione = await getPrestazioneById(spItemId)
    if (!prestazione.email) {
      return NextResponse.json(
        { error: 'Email del prestatore mancante: impossibile inviare la notula' },
        { status: 400 },
      )
    }

    const calc = calcolaNotula(importoLordo)

    // 1. Genera notula .docx
    const notula = generaNotula(prestazione, importoLordo)

    // 2. Carica nella cartella della prestazione
    const { prestazione: cartella } = await ensureCartellaPrestazione({
      nome: prestazione.nome,
      cognome: prestazione.cognome,
      codiceFiscale: prestazione.codiceFiscale,
      dataCartella: prestazione.dataInserimento,
    })
    await uploadAllegato(cartella.path, notula.filename, new Uint8Array(notula.buffer), DOCX_MIME)

    // 3. Token monouso (riusa quello esistente se già presente)
    const token = prestazione.notulaToken || randomBytes(24).toString('hex')
    await aggiornaPrestazione(spItemId, {
      ImportoLordo: importoLordo,
      NotulaToken: token,
      Stato: 'Notula inviata',
    })

    // 4. Mail al prestatore con allegato + link upload
    const uploadUrl = `${baseUrl(req)}/notula/${token}`
    await notificaNotulaAlPrestatore({
      to: prestazione.email,
      from: prestazione.responsabileEmail,
      prestatoreNome: prestazione.nome,
      idPrestazione: prestazione.idPrestazione,
      uploadUrl,
      importoLordo: calc.lordo,
      ritenuta: calc.ritenuta,
      netto: calc.netto,
      notula: {
        filename: notula.filename,
        contentBase64: notula.buffer.toString('base64'),
        contentType: DOCX_MIME,
      },
    })

    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: 'prestazione.notula-inviata',
      entita: 'PrestazioneOccasionale',
      entitaId: prestazione.idPrestazione,
      dettagli: { importoLordo },
    })

    return NextResponse.json(
      { idPrestazione: prestazione.idPrestazione, ...calc, uploadUrl },
      { status: 200 },
    )
  } catch (err: any) {
    console.error('[POST /api/prestazioni/[spItemId]/notula]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
