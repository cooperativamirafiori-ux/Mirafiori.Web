/**
 * Allegato del ticket, caricato dal browser direttamente su SharePoint.
 *
 *   POST /api/assistenza/[id]/allegato — apre la sessione di caricamento
 *   PUT  /api/assistenza/[id]/allegato — conferma e scrive url e nome sul ticket
 *
 * Due passaggi della stessa operazione sulla stessa risorsa, quindi due verbi
 * sulla stessa route: è la forma prevista da `caricaDirettamente`.
 *
 * Può allegare il richiedente (subito dopo l'invio, dal form) e chi fa
 * assistenza (una foto scattata sul posto). Il file non transita mai dal
 * nostro server.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { aggiornaTicket, assistenzaConfigurata, getTicketById } from '@/lib/assistenza/data'
import { allegatiAttivi, creaSessioneAllegato, trovaAllegato } from '@/lib/assistenza/allegati'
import { getSPUserLookupId } from '@/lib/core/sp'
import { MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/core/upload-diretto'
import { AREA_ASSISTENZA } from '@/types/assistenza'

export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

/** Il ticket è tuo o hai il permesso dell'area: altrimenti non si allega. */
async function autorizzato(id: string) {
  const session = await auth()
  if (!session?.user?.email) return { errore: err('Non autenticato', 401) }
  const t = await getTicketById(id)
  if (session.user.permessi?.includes(AREA_ASSISTENZA)) return { t }
  const mio = await getSPUserLookupId(session.user.email).catch(() => 0)
  if (!mio || mio !== t.richiedenteLookupId) return { errore: err('Accesso negato', 403) }
  return { t }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!assistenzaConfigurata()) return err('Sezione assistenza non configurata', 503)
  if (!allegatiAttivi()) return err('Libreria allegati non configurata', 503)

  const { t, errore } = await autorizzato(id)
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
    return err(`File troppo grande: il massimo è ${maxUploadMb()} MB.`)
  }

  try {
    const sessione = await creaSessioneAllegato(t!.codice, filename)
    return NextResponse.json(sessione)
  } catch (e: any) {
    console.error(`[POST /api/assistenza/${id}/allegato]`, e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!assistenzaConfigurata()) return err('Sezione assistenza non configurata', 503)

  const { t, errore } = await autorizzato(id)
  if (errore) return errore

  let body: { nomeFile?: string }
  try {
    body = await req.json()
  } catch {
    return err('Body non valido')
  }
  const nomeFile = (body.nomeFile ?? '').trim()
  if (!nomeFile) return err('Nome del file mancante')

  try {
    const file = await trovaAllegato(nomeFile)
    await aggiornaTicket(t!.spItemId, { AllegatoUrl: file.url, AllegatoNome: file.nome })
    return NextResponse.json({ allegatoUrl: file.url, allegatoNome: file.nome })
  } catch (e: any) {
    console.error(`[PUT /api/assistenza/${id}/allegato]`, e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}
