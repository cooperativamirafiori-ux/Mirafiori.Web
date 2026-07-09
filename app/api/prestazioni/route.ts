/**
 * POST /api/prestazioni — Attiva una nuova prestazione occasionale.
 *
 * Riceve FormData (per gli allegati). Flusso "Salva":
 *   1. Crea il record su SharePoint (Stato="Bozza") e genera ID PREST-YYYY-XXX
 *   2. Crea/usa la cartella del prestatore + sottocartella della prestazione
 *   3. Carica gli allegati (copia CF + carta d'identità) nella sottocartella
 *   4. Invia la mail di riepilogo a info@ (Luca) e claudia.carena@
 *
 * NB: la generazione contratto + invio DocuSign è un modulo separato, da collegare in seguito.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  creaPrestazione,
  aggiornaPrestazione,
  ensureCartellaPrestazione,
  ensureCartellaDocumentiIdentita,
  haDocumentiIdentita,
  uploadAllegato,
} from '@/lib/prestazioni'
import { notificaRiepilogoPrestazione } from '@/lib/notifications'
import { logAzione } from '@/lib/audit'
import { CASISTICHE_GDPR_KEYS } from '@/lib/casistiche-gdpr'

const CF_REGEX = /^[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]$/
const MAX_FILE_BYTES = 4 * 1024 * 1024 // 4 MB (upload semplice Graph)

function str(fd: FormData, key: string): string {
  const v = fd.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  let fd: FormData
  try {
    fd = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso FormData)' }, { status: 400 })
  }

  const dati = {
    nome: str(fd, 'nome'),
    cognome: str(fd, 'cognome'),
    dataNascita: str(fd, 'dataNascita'),
    luogoNascita: str(fd, 'luogoNascita'),
    codiceFiscale: str(fd, 'codiceFiscale').toUpperCase(),
    residenza: str(fd, 'residenza'),
    ruolo: str(fd, 'ruolo'),
    email: str(fd, 'email'),
    telefono: str(fd, 'telefono'),
    iban: str(fd, 'iban').toUpperCase().replace(/\s+/g, ''),
    giorni: Number(str(fd, 'giorni')),
    dataInizio: str(fd, 'dataInizio'),
    dataFine: str(fd, 'dataFine'),
    attivita: str(fd, 'attivita'),
    compensoPrevisto: Number(str(fd, 'compensoPrevisto').replace(',', '.')),
    casisticaGdpr: str(fd, 'casisticaGdpr'),
  }

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

  // Allegati identità: OPZIONALI (obbligatori solo al primo inserimento di
  // questo prestatore — la verifica avviene più sotto via SharePoint).
  const fileCf =
    fd.get('copiaCf') instanceof File && (fd.get('copiaCf') as File).size > 0
      ? (fd.get('copiaCf') as File)
      : null
  const fileCi =
    fd.get('copiaCi') instanceof File && (fd.get('copiaCi') as File).size > 0
      ? (fd.get('copiaCi') as File)
      : null
  for (const f of [fileCf, fileCi]) {
    if (f && f.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `Allegato troppo grande (max 4 MB): ${f.name}` },
        { status: 400 },
      )
    }
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
    //    Se no e non sono stati allegati, blocca prima di creare il record.
    const docsGiaPresenti = await haDocumentiIdentita(prestatore)
    if (!docsGiaPresenti && (!fileCf || !fileCi)) {
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

    // 3. Documenti d'identità → cartella "Documenti Identità" (a livello prestatore).
    //    Caricati solo se forniti; se già presenti e non riallegati, si saltano.
    if (fileCf || fileCi) {
      const cartellaDocs = await ensureCartellaDocumentiIdentita(prestatore)
      if (fileCf) {
        const cfBuf = new Uint8Array(await fileCf.arrayBuffer())
        const extCf = fileCf.name.includes('.') ? fileCf.name.split('.').pop() : 'pdf'
        await uploadAllegato(cartellaDocs.path, `CodiceFiscale_${dati.codiceFiscale}.${extCf}`, cfBuf, fileCf.type)
      }
      if (fileCi) {
        const ciBuf = new Uint8Array(await fileCi.arrayBuffer())
        const extCi = fileCi.name.includes('.') ? fileCi.name.split('.').pop() : 'pdf'
        await uploadAllegato(cartellaDocs.path, `CartaIdentita_${dati.codiceFiscale}.${extCi}`, ciBuf, fileCi.type)
      }
    }

    // 4. Aggiorna Title + URL cartella
    await aggiornaPrestazione(spItemId, {
      Title: idPrestazione,
      CartellaUrl: cartella.webUrl,
    })

    // 5. Mail di riepilogo (non bloccante)
    await notificaRiepilogoPrestazione({
      idPrestazione,
      ...dati,
      responsabileNome: responsabile.nome,
      responsabileEmail: responsabile.email,
      cartellaUrl: cartella.webUrl,
    }).catch((e) => console.error('[prestazioni] invio riepilogo fallito', e))

    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: 'prestazione.crea',
      entita: 'PrestazioneOccasionale',
      entitaId: idPrestazione,
      dettagli: { prestatore: `${dati.cognome} ${dati.nome}`.trim(), ruolo: dati.ruolo },
    })

    return NextResponse.json(
      { idPrestazione, spItemId, cartellaUrl: cartella.webUrl },
      { status: 201 },
    )
  } catch (err: any) {
    console.error('[POST /api/prestazioni]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
