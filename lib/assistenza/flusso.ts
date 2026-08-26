/**
 * Regole di flusso dell'Assistenza IT, separate dalle route.
 *
 * Qui stanno le due cose che le route non devono reinventare: **chi** va
 * avvisato (risolvere una mail da una Person column non è banale) e **quali**
 * passaggi di stato hanno senso.
 *
 * Rispetto ad Acquisti manca tutta la macchina della conferma tokenizzata: il
 * ticket lo chiude l'IT, e se il problema torna il richiedente lo riapre da
 * "Le mie richieste" — è già dentro l'app, un link senza login non serve.
 */

import { getSPUserEmailByLookupId } from '@/lib/core/sp'
import { getUtentiPerArea } from '@/lib/core/permessi'
import {
  AREA_ASSISTENZA,
  GIORNI_RIAPERTURA,
  STATI_APERTI,
  riapribile,
  type AzioneAssistenza,
  type RichiestaAssistenza,
  type StatoAssistenza,
} from '@/types/assistenza'

export const baseApp = () =>
  (process.env.APP_BASE_URL || 'https://mirafiori-web.vercel.app').replace(/\/$/, '')

export const linkGestione = () => `${baseApp()}/assistenza/gestione`
export const linkMie = () => `${baseApp()}/assistenza/mie`

// ============================================================
// Destinatari
// ============================================================

/** Email del richiedente: la Person column non la espone, va risolta a parte. */
export async function emailRichiedente(t: RichiestaAssistenza): Promise<string> {
  if (!t.richiedenteLookupId) return ''
  try {
    return await getSPUserEmailByLookupId(t.richiedenteLookupId)
  } catch (err) {
    console.error('[assistenza] email richiedente non risolta', t.codice, err)
    return ''
  }
}

/** Email di chi ha il ticket in mano, se assegnato. */
export async function emailAssegnato(t: RichiestaAssistenza): Promise<string> {
  if (!t.assegnatoLookupId) return ''
  try {
    return await getSPUserEmailByLookupId(t.assegnatoLookupId)
  } catch (err) {
    console.error('[assistenza] email assegnatario non risolta', t.codice, err)
    return ''
  }
}

/**
 * Chi fa assistenza: gli utenti con l'area "IT e Dispositivi".
 *
 * È lo stesso permesso dell'anagrafica dispositivi, non uno nuovo: le persone
 * sono le stesse e due elenchi per la stessa squadra divergono al primo cambio
 * di organico.
 */
export async function emailGestori(): Promise<string[]> {
  return getUtentiPerArea(AREA_ASSISTENZA)
}

/**
 * A chi va l'avviso di un movimento sul ticket: chi ce l'ha in mano se c'è,
 * altrimenti tutta la squadra. Evita di svegliare cinque persone per un ticket
 * che ha già un responsabile.
 */
export async function destinatariLavoro(t: RichiestaAssistenza): Promise<string[]> {
  const assegnato = await emailAssegnato(t)
  if (assegnato) return [assegnato]
  return emailGestori()
}

// ============================================================
// Transizioni
// ============================================================

/** Azioni riservate a chi ha il permesso d'area. */
export const AZIONI_GESTORE: AzioneAssistenza[] = [
  'prendi-in-carico',
  'assegna',
  'priorita',
  'lavora',
  'attesa-fornitore',
  'chiedi-info',
  'risolvi',
  'annulla',
  'note',
]

/** Azioni che il richiedente può fare sul proprio ticket. */
export const AZIONI_RICHIEDENTE: AzioneAssistenza[] = ['riapri']

/**
 * Stato in cui l'azione porta il ticket.
 *
 * `assegna`, `priorita` e `note` non compaiono: cambiano un campo, non la fase.
 * L'unica eccezione è l'assegnazione di un ticket ancora "Inviata", trattata in
 * `statoDopoAssegnazione`: assegnare qualcosa e lasciarlo "non visto" sarebbe
 * una bugia sulla coda.
 */
export const STATO_DOPO: Partial<Record<AzioneAssistenza, StatoAssistenza>> = {
  'prendi-in-carico': 'Presa in carico',
  'lavora': 'In lavorazione',
  'attesa-fornitore': 'Attesa fornitore',
  'chiedi-info': 'Attesa utente',
  'risolvi': 'Risolta',
  'annulla': 'Annullata',
  'riapri': 'In lavorazione',
}

export function statoDopoAssegnazione(stato: StatoAssistenza): StatoAssistenza | undefined {
  return stato === 'Inviata' ? 'Presa in carico' : undefined
}

/**
 * Se l'azione ha senso sul ticket com'è adesso.
 *
 * Il motivo è pensato per essere mostrato all'utente: dice cosa è successo
 * ("l'ha già preso in carico qualcuno"), non quale controllo è fallito.
 */
export function azioneAmmessa(
  t: RichiestaAssistenza,
  azione: AzioneAssistenza,
): { ok: true } | { ok: false; motivo: string } {
  const aperto = STATI_APERTI.includes(t.stato)

  // Le note si scrivono sempre: anche su un ticket chiuso può servire
  // aggiungere l'informazione che è arrivata dopo.
  if (azione === 'note') return { ok: true }

  if (t.stato === 'Annullata') {
    return { ok: false, motivo: 'Il ticket è annullato: non si può più lavorare.' }
  }

  if (azione === 'riapri') {
    if (t.stato !== 'Risolta') {
      return { ok: false, motivo: 'Si può riaprire solo un ticket risolto.' }
    }
    if (!riapribile(t)) {
      return {
        ok: false,
        motivo: `Sono passati più di ${GIORNI_RIAPERTURA} giorni dalla chiusura: apri una nuova richiesta, così lo storico resta leggibile.`,
      }
    }
    return { ok: true }
  }

  if (azione === 'prendi-in-carico') {
    if (t.stato !== 'Inviata') {
      return { ok: false, motivo: `Il ticket è già nello stato "${t.stato}".` }
    }
    return { ok: true }
  }

  if (!aperto) {
    return {
      ok: false,
      motivo: 'Il ticket è chiuso: per rimetterci mano deve prima riaprirlo il richiedente.',
    }
  }

  return { ok: true }
}

/**
 * Riapertura: torna in lavorazione, il contatore sale e la data di chiusura si
 * cancella.
 *
 * Il contatore è il dato interessante: un ticket riaperto tre volte dice che il
 * guasto non era quello che si pensava, e si vede in elenco senza aprire nulla.
 */
export function campiRiapertura(t: RichiestaAssistenza, perche?: string): Record<string, unknown> {
  const nota = [
    t.noteInterne,
    `Riaperto dal richiedente il ${new Date().toLocaleDateString('it-IT')}${
      perche?.trim() ? `: ${perche.trim()}` : '.'
    }`,
  ]
    .filter(Boolean)
    .join('\n')

  return {
    Stato: 'In lavorazione',
    DataChiusura: null,
    Riaperture: (t.riaperture ?? 0) + 1,
    NoteInterne: nota,
  }
}
