/**
 * Logica di flusso delle Richieste Acquisto, separata dalle route.
 *
 * Serve perché gli stessi passaggi vengono innescati da tre punti diversi:
 *   - le API in app/api/acquisti (utente loggato);
 *   - la pagina pubblica di conferma consegna (link tokenizzato, senza login);
 *   - il cron giornaliero (nessun utente).
 */

import {
  aggiornaAcquisto,
  generaCostoDaAcquisto,
  getAcquistoById,
  AREA_ACQUISTI,
} from '@/lib/acquisti'
import { getSPUserEmailByLookupId, getUtentiPerArea } from '@/lib/sharepoint'
import {
  destinatariAcquisti,
  notificaEsitoConsegna,
  notificaConfermaConsegna,
} from '@/lib/notifications'
import { dataBreve, type EsitoConsegna, type RichiestaAcquisto } from '@/types/acquisti'

export const baseApp = () =>
  (process.env.APP_BASE_URL || 'https://mirafiori-web.vercel.app').replace(/\/$/, '')

export const linkGestione = () => `${baseApp()}/acquisti/gestione`
export const linkConsegna = (token: string) => `${baseApp()}/consegna/${token}`

/** Email del richiedente: la Person column non la espone, va risolta a parte. */
export async function emailRichiedente(a: RichiestaAcquisto): Promise<string> {
  if (!a.richiedenteLookupId) return ''
  try {
    return await getSPUserEmailByLookupId(a.richiedenteLookupId)
  } catch (err) {
    console.error('[acquisti] email richiedente non risolta', a.codice, err)
    return ''
  }
}

/** Email dei gestori acquisti (chi ha il permesso d'area). */
export async function emailGestori(): Promise<string[]> {
  return getUtentiPerArea(AREA_ACQUISTI)
}

/**
 * Registra l'esito della consegna.
 *
 * "Tutto ok"        → Consegnata, e la spesa entra in Costi Strutture.
 * "Da restituire"   → Problema: la richiesta torna al gestore.
 * "Non arrivato"    → Problema, idem.
 *
 * Idempotente: se la richiesta non è più in stato Ordinata non fa nulla e lo
 * dichiara, così la pagina pubblica può mostrare "hai già risposto" invece di
 * sovrascrivere una risposta precedente.
 */
export async function registraEsitoConsegna(
  spItemId: string,
  esito: EsitoConsegna,
  note?: string,
): Promise<{ ok: boolean; motivo?: string; stato: string }> {
  const a = await getAcquistoById(spItemId)

  if (a.stato !== 'Ordinata') {
    return {
      ok: false,
      motivo:
        a.stato === 'Consegnata' || a.stato === 'Problema'
          ? 'Hai già risposto per questa richiesta.'
          : `La richiesta è nello stato "${a.stato}": non è in attesa di conferma.`,
      stato: a.stato,
    }
  }

  const tuttoOk = esito === 'Tutto ok'
  const nuovoStato = tuttoOk ? 'Consegnata' : 'Problema'

  await aggiornaAcquisto(spItemId, {
    Stato: nuovoStato,
    EsitoConsegna: esito,
    NoteEsito: note?.trim() || '',
    DataConsegnaEffettiva: new Date().toISOString(),
  })

  if (tuttoOk) {
    const aggiornata = await getAcquistoById(spItemId)
    const esitoCosto = await generaCostoDaAcquisto(aggiornata)
    if (!esitoCosto.generato && esitoCosto.motivo !== 'già generato') {
      console.warn('[acquisti] costo non generato per', a.codice, '→', esitoCosto.motivo)
    }
  }

  const gestori = await emailGestori()
  notificaEsitoConsegna({
    to: destinatariAcquisti(gestori),
    codice: a.codice,
    descrizione: a.descrizione,
    richiedente: a.richiedenteNome,
    esito,
    note,
    linkApp: linkGestione(),
  }).catch(console.error)

  return { ok: true, stato: nuovoStato }
}

/**
 * Invia (o sollecita) la richiesta di conferma consegna al richiedente.
 * Ritorna false se non c'è niente da inviare, così il cron può contare.
 */
export async function inviaRichiestaConferma(
  a: RichiestaAcquisto,
  opts: { sollecito: boolean; giorniAllaChiusura?: number },
): Promise<boolean> {
  if (!a.confermaToken) {
    console.warn('[acquisti] token di conferma assente per', a.codice)
    return false
  }
  const to = await emailRichiedente(a)
  if (!to) return false

  await notificaConfermaConsegna({
    to,
    richiedenteNome: (a.richiedenteNome || '').split(' ')[0] || 'ciao',
    codice: a.codice,
    descrizione: a.descrizione,
    luogoConsegna: a.luogoConsegna?.value || a.struttura.value,
    urlBase: linkConsegna(a.confermaToken),
    sollecito: opts.sollecito,
    giorniAllaChiusura: opts.giorniAllaChiusura,
  })

  await aggiornaAcquisto(
    a.spItemId,
    opts.sollecito ? { SollecitoInviato: true } : { NotificaConsegnaInviata: true },
  )
  return true
}

/**
 * Chiusura d'ufficio: nessun riscontro dopo la finestra prevista.
 * Meglio una richiesta chiusa con una nota che una coda che cresce e che
 * nessuno guarda più.
 */
export async function chiudiSenzaRiscontro(a: RichiestaAcquisto): Promise<void> {
  const nota = [
    a.noteEsito,
    `Chiusa automaticamente il ${dataBreve(new Date().toISOString())}: nessun riscontro dal richiedente entro i giorni previsti.`,
  ]
    .filter(Boolean)
    .join('\n')

  await aggiornaAcquisto(a.spItemId, {
    Stato: 'Consegnata',
    EsitoConsegna: 'Tutto ok',
    NoteEsito: nota,
    DataConsegnaEffettiva: new Date().toISOString(),
  })

  const aggiornata = await getAcquistoById(a.spItemId)
  await generaCostoDaAcquisto(aggiornata)
}
