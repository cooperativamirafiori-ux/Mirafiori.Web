/**
 * POST /api/notula/[token]/conferma — endpoint PUBBLICO (token), NON richiede login.
 *
 * Chiamata dal browser del prestatore dopo che la notula è stata caricata
 * direttamente su SharePoint: legge il webUrl del file, porta lo stato a
 * "Notula ricevuta", notifica info@ + Claudia + responsabile e scrive nel log.
 *
 * Il token viene rivalidato qui: la conferma non si fida di quanto fatto prima.
 * `nomeFile` viene ignorato se non corrisponde al nome deciso dal server
 * all'apertura della sessione — il prestatore non può far registrare un file
 * arbitrario come sua notula.
 *
 * Body JSON: { nomeFile: string }
 * Risposta:  { ok: true }
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getPrestazioneByToken,
  aggiornaPrestazione,
  ensureCartellaPrestazione,
  getWebUrlFile,
} from '@/lib/prestazioni/data'
import { notificaNotulaCaricata } from '@/lib/prestazioni/notifiche'
import { logAzione } from '@/lib/core/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const p = await getPrestazioneByToken(token).catch(() => null)
  if (!p) return NextResponse.json({ error: 'Link non valido o scaduto' }, { status: 404 })

  let nomeFile = ''
  try {
    const body = await req.json()
    nomeFile = typeof body?.nomeFile === 'string' ? body.nomeFile.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso JSON)' }, { status: 400 })
  }

  // Il nome deve essere quello generato dal server: {ID}_Notula_firmata.{ext}
  const atteso = new RegExp(
    `^${p.idPrestazione.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_Notula_firmata\\.[a-z0-9]+$`,
    'i',
  )
  if (!atteso.test(nomeFile)) {
    return NextResponse.json({ error: 'Nome file non valido' }, { status: 400 })
  }

  try {
    const { prestazione: cartella } = await ensureCartellaPrestazione({
      nome: p.nome,
      cognome: p.cognome,
      codiceFiscale: p.codiceFiscale,
      dataCartella: p.dataInserimento,
    })

    const webUrl = await getWebUrlFile(cartella.path, nomeFile)
    if (!webUrl) {
      return NextResponse.json(
        { error: 'File non trovato su SharePoint: riprova il caricamento' },
        { status: 409 },
      )
    }

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
      dettagli: { origine: 'esterno via token', file: nomeFile },
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/notula/[token]/conferma]', err?.message ?? err)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}
