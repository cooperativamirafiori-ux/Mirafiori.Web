/**
 * POST /api/prestazioni — Attiva una nuova prestazione occasionale.
 *
 * Riceve JSON (NON più FormData): i documenti d'identità vengono caricati dal
 * browser direttamente su SharePoint, quindi qui non transitano byte di file e
 * non vale più il limite dei 4 MB dell'upload semplice di Graph.
 *
 * Flusso completo lato client:
 *   1. POST /api/prestazioni                                  ← questa route
 *      crea il record (Stato="Bozza"), l'ID PREST-YYYY-XXX e le cartelle
 *   2. POST /api/prestazioni/[spItemId]/allegati-identita      (per ogni file)
 *      apre la sessione, il browser fa il PUT diretto a SharePoint
 *   3. POST /api/prestazioni/[spItemId]/conferma
 *      invia la mail di riepilogo e scrive nel log
 *
 * La mail parte solo al passo 3: se il caricamento dei documenti si interrompe,
 * nessuno riceve un riepilogo di una pratica incompleta.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  creaPrestazione,
  aggiornaPrestazione,
  ensureCartellaPrestazione,
  haDocumentiIdentita,
} from '@/lib/prestazioni'
import { CASISTICHE_GDPR_KEYS } from '@/lib/casistiche-gdpr'

const CF_REGEX = /^[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]$/

export const dynamic = 'force-dynamic'

function str(body: Record<string, unknown>, key: string): string {
  const v = body[key]
  return typeof v === 'string' ? v.trim() : ''
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso JSON)' }, { status: 400 })
  }

  const dati = {
    nome: str(body, 'nome'),
    cognome: str(body, 'cognome'),
    dataNascita: str(body, 'dataNascita'),
    luogoNascita: str(body, 'luogoNascita'),
    codiceFiscale: str(body, 'codiceFiscale').toUpperCase(),
    residenza: str(body, 'residenza'),
    ruolo: str(body, 'ruolo'),
    email: str(body, 'email'),
    telefono: str(body, 'telefono'),
    iban: str(body, 'iban').toUpperCase().replace(/\s+/g, ''),
    giorni: Number(str(body, 'giorni')),
    dataInizio: str(body, 'dataInizio'),
    dataFine: str(body, 'dataFine'),
    attivita: str(body, 'attivita'),
    compensoPrevisto: Number(str(body, 'compensoPrevisto').replace(',', '.')),
    casisticaGdpr: str(body, 'casisticaGdpr'),
  }

  // Il client dichiara quali documenti sta per caricare: serve per la verifica
  // "primo inserimento" prima di creare il record.
  const allegheraCf = body.allegheraCf === true
  const allegheraCi = body.allegheraCi === true

  // --- Validazione server-side ---
  const mancanti = Object.entries({
    nome: dati.nome,
    cognome: dati.cognome,
    dataNascita: dati.dataNascita,
    luogoNascita: dati.luogoNascita,
    codiceFiscale: dati.codiceFiscale,
    residenza: dati.residenza,
    ruolo: dati.ruolo,
    email: dati.email,
    telefono: dati.telefono,
    iban: dati.iban,
    dataInizio: dati.dataInizio,
    dataFine: dati.dataFine,
    attivita: dati.attivita,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k)

  if (mancanti.length) {
    return NextResponse.json(
      { error: `Campi obbligatori mancanti: ${mancanti.join(', ')}` },
      { status: 400 },
    )
  }
  if (!CF_REGEX.test(dati.codiceFiscale)) {
    return NextResponse.json({ error: 'Codice fiscale non valido' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dati.email)) {
    return NextResponse.json({ error: 'Email non valida' }, { status: 400 })
  }
  // IBAN: validazione di formato (lunghezza/struttura), non checksum
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(dati.iban)) {
    return NextResponse.json({ error: 'IBAN non valido' }, { status: 400 })
  }
  if (!Number.isInteger(dati.giorni) || dati.giorni <= 0) {
    return NextResponse.json({ error: 'Numero giorni non valido' }, { status: 400 })
  }
  if (!Number.isFinite(dati.compensoPrevisto) || dati.compensoPrevisto <= 0) {
    return NextResponse.json({ error: 'Compenso previsto non valido' }, { status: 400 })
  }
  if (dati.dataFine < dati.dataInizio) {
    return NextResponse.json({ error: 'La data fine precede la data inizio' }, { status: 400 })
  }
  if (!dati.casisticaGdpr) {
    return NextResponse.json({ error: 'Seleziona la casistica GDPR' }, { status: 400 })
  }
  if (!CASISTICHE_GDPR_KEYS.includes(dati.casisticaGdpr)) {
    return NextResponse.json({ error: 'Casistica GDPR non valida' }, { status: 400 })
  }

  try {
    const responsabile = {
      email: session.user.email,
      nome: session.user.name ?? session.user.email,
    }

    const prestatore = {
      nome: dati.nome,
      cognome: dati.cognome,
      codiceFiscale: dati.codiceFiscale,
    }

    // 0. Documenti d'identità già archiviati per questo prestatore?
    //    Se no e il client non ne sta caricando entrambi, blocca prima di
    //    creare il record (per non lasciare pratiche orfane).
    const docsGiaPresenti = await haDocumentiIdentita(prestatore)
    if (!docsGiaPresenti && (!allegheraCf || !allegheraCi)) {
      return NextResponse.json(
        {
          error:
            'Primo inserimento di questo prestatore: allega sia la copia del codice fiscale sia la carta d’identità.',
        },
        { status: 400 },
      )
    }

    // 1. Record su SharePoint + ID progressivo
    const { spItemId, numericId, dataInserimento } = await creaPrestazione(dati, responsabile)
    const anno = new Date().getFullYear()
    const idPrestazione = `PREST-${anno}-${String(numericId).padStart(3, '0')}`

    // 2. Cartella prestatore + sottocartella prestazione (nome = data di registrazione)
    const { prestazione: cartella } = await ensureCartellaPrestazione({
      ...prestatore,
      dataCartella: dataInserimento,
    })

    // 3. Title + URL cartella
    await aggiornaPrestazione(spItemId, {
      Title: idPrestazione,
      CartellaUrl: cartella.webUrl,
    })

    // Mail di riepilogo e log: al passo di conferma, dopo gli upload diretti.
    return NextResponse.json(
      { idPrestazione, spItemId, cartellaUrl: cartella.webUrl, documentiGiaPresenti: docsGiaPresenti },
      { status: 201 },
    )
  } catch (err: any) {
    console.error('[POST /api/prestazioni]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
