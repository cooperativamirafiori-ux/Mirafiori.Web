/**
 * Foto della richiesta, caricata dal browser direttamente su SharePoint.
 *
 *   POST /api/manutenzioni/[id]/allegato — apre la sessione di caricamento
 *   PUT  /api/manutenzioni/[id]/allegato — conferma e scrive url e nome sulla richiesta
 *
 * Due passaggi della stessa operazione sulla stessa risorsa, quindi due verbi
 * sulla stessa route: è la forma prevista da `caricaDirettamente`.
 *
 * `[id]` è lo `spItemId`. Allega chi ha aperto la richiesta (subito dopo
 * l'invio, dal modulo) e la gestione (isAdmin). Il file non transita mai dal
 * nostro server.
 *
 * Il log va SEMPRE nella conferma, mai all'apertura della sessione.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { logAzione } from '@/lib/core/audit'
import { MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/core/upload-diretto'
import { aggiornaRichiesta, eRichiedente, getRichiestaById } from '@/lib/manutenzioni/data'
import { allegatiAttivi, creaSessioneAllegato, trovaAllegato } from '@/lib/manutenzioni/allegati'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

/** La richiesta è tua o sei della gestione: altrimenti non si allega. */
async function autorizzato(id: string) {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { errore: err('Non autenticato', 401) }

  let richiesta
  try {
    richiesta = await getRichiestaById(id)
  } catch {
    return { errore: err('Richiesta non trovata', 404) }
  }
  const consentito = Boolean(session.user.isAdmin) || (await eRichiedente(richiesta, email))
  if (!consentito) return { errore: err('Accesso negato', 403) }
  return { richiesta, session }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!allegatiAttivi()) return err('Libreria allegati non configurata', 503)

  const { richiesta, errore } = await autorizzato(id)
  if (errore) return errore

  let body: { filename?: string; dimensione?: number }
  try {
    body = await req.json()
  } catch {
    return err('Body non valido')
  }

  const filename = (body.filename ?? '').trim()
  if (!filename) return err('Nome del file mancante')
  if (Number(body.dimensione) > MAX_UPLOAD_BYTES) {
    return err(`File troppo grande: il massimo è ${maxUploadMb()} MB.`, 413)
  }

  try {
    const sessione = await creaSessioneAllegato(richiesta!.idRichiesta || `MAN-${id}`, filename)
    return NextResponse.json(sessione)
  } catch (e: any) {
    console.error(`[POST /api/manutenzioni/${id}/allegato]`, e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { richiesta, session, errore } = await autorizzato(id)
  if (errore) return errore

  let body: { nomeFile?: string }
  try {
    body = await req.json()
  } catch {
    return err('Body non valido')
  }
  const nomeFile = (body.nomeFile ?? '').trim()
  if (!nomeFile) return err('Nome del file mancante')

  // Il nome lo decide il server all'apertura della sessione e porta il codice
  // della richiesta: un nome che non comincia così non è roba nostra.
  if (richiesta!.idRichiesta && !nomeFile.startsWith(richiesta!.idRichiesta)) {
    return err('Il file non corrisponde a questa richiesta')
  }

  try {
    const file = await trovaAllegato(nomeFile)
    await aggiornaRichiesta(richiesta!.spItemId, { AllegatoUrl: file.url, AllegatoNome: file.nome })
    await logAzione({
      utente: session!.user.email!,
      nome: session!.user.name,
      azione: 'manutenzione.allegato',
      entita: 'RichiestaManutenzione',
      entitaId: richiesta!.idRichiesta,
      dettagli: { file: file.nome },
    })
    return NextResponse.json({ allegatoUrl: file.url, allegatoNome: file.nome })
  } catch (e: any) {
    console.error(`[PUT /api/manutenzioni/${id}/allegato]`, e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}
