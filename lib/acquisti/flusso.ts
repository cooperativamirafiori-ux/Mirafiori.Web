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
} from '@/lib/acquisti/data'
import { getSPUserEmailByLookupId } from '@/lib/core/sp'
import { getUtentiPerArea } from '@/lib/core/permessi'
import { destinatariAcquisti, notificaEsitoConsegna, notificaConfermaConsegna, notificaOrdineDaRitirare } from '@/lib/acquisti/notifiche'
import {
  ESITO_SENZA_RISCONTRO,
  dataBreve,
  luogoCorrisponde,
  type EsitoConsegna,
  type RichiestaAcquisto,
} from '@/types/acquisti'

export const baseApp = () =>
  (process.env.APP_BASE_URL || 'https://mirafiori-web.vercel.app').replace(/\/$/, '')

export const linkGestione = () => `${baseApp()}/acquisti/gestione`
export const linkConsegna = (token: string) => `${baseApp()}/consegna/${token}`

// ============================================================
// Consegna presidiata (Strada del Drosso)
// ============================================================
//
// Su Strada del Drosso la merce arriva in ufficio, non dove sta il richiedente:
// chiedere a lui "è arrivato?" significa chiederlo a chi non può vederlo. Lì la
// conferma la danno i referenti dell'ufficio e, appena confermano, il
// richiedente riceve l'avviso che può passare a ritirare.
//
// I valori stanno in variabili d'ambiente con questi default, così cambiare i
// referenti non richiede una modifica al codice. Per una seconda struttura
// presidiata servirebbe invece una piccola estensione: oggi la regola è una.

/** Struttura di consegna presidiata, confrontata per inclusione sull'etichetta. */
export const strutturaPresidiata = () =>
  process.env.ACQUISTI_PRESIDIO_STRUTTURA || 'Strada del Drosso'

/** Chi conferma la consegna al posto del richiedente. */
export const referentiPresidio = (): string[] =>
  (
    process.env.ACQUISTI_PRESIDIO_REFERENTI ||
    'stefano.martino@cooperativamirafiori.com,eleonora.dessi@cooperativamirafiori.com'
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'))

/** Dove il richiedente deve andare a ritirare, come lo scriviamo in mail. */
export const luogoRitiro = () =>
  process.env.ACQUISTI_PRESIDIO_RITIRO || 'Ufficio in Strada del Drosso'

/** true se la consegna di questa richiesta è presidiata dall'ufficio. */
export function consegnaPresidiata(a: RichiestaAcquisto): boolean {
  return luogoCorrisponde(a, strutturaPresidiata())
}

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

    // Consegna presidiata: chi ha chiesto l'articolo non l'ha visto arrivare e
    // non sa che è lì. La conferma dei referenti è il momento in cui glielo si
    // può dire, ed è l'unico avviso che riceve.
    if (consegnaPresidiata(a)) {
      const to = await emailRichiedente(a)
      if (to) {
        notificaOrdineDaRitirare({
          to,
          richiedenteNome: (a.richiedenteNome || '').split(' ')[0] || '',
          codice: a.codice,
          descrizione: a.descrizione,
          quantita: a.quantita,
          luogoRitiro: luogoRitiro(),
        }).catch(console.error)
      } else {
        console.warn('[acquisti] avviso di ritiro non inviato, email richiedente assente', a.codice)
      }
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
 * Invia (o sollecita) la richiesta di conferma consegna.
 *
 * Va al richiedente, tranne per le consegne presidiate: lì va ai referenti
 * dell'ufficio, che sono gli unici a poter vedere se il pacco è arrivato.
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

  const presidiata = consegnaPresidiata(a)
  const to = presidiata ? referentiPresidio() : await emailRichiedente(a)
  if (!to || (Array.isArray(to) && !to.length)) return false

  await notificaConfermaConsegna({
    to,
    richiedenteNome: (a.richiedenteNome || '').split(' ')[0] || 'ciao',
    codice: a.codice,
    descrizione: a.descrizione,
    luogoConsegna: a.luogoConsegna?.value || a.struttura.value,
    urlBase: linkConsegna(a.confermaToken),
    sollecito: opts.sollecito,
    giorniAllaChiusura: opts.giorniAllaChiusura,
    // Per i referenti la mail cambia tono: non "è arrivato il tuo ordine" ma
    // "è arrivato l'ordine di Tizio", con l'avviso che confermando lo chiamiamo.
    perRichiedente: presidiata ? a.richiedenteNome || 'un collega' : undefined,
    luogoRitiro: presidiata ? luogoRitiro() : undefined,
  })

  await aggiornaAcquisto(
    a.spItemId,
    opts.sollecito ? { SollecitoInviato: true } : { NotificaConsegnaInviata: true },
  )
  return true
}

/**
 * Chiusura d'ufficio: nessun riscontro dopo la finestra prevista.
 *
 * Meglio una richiesta chiusa con una nota che una coda che cresce e che nessuno
 * guarda più. L'esito è però ESITO_SENZA_RISCONTRO, non "Tutto ok": la consegna
 * è presunta, non verificata, e nei report la differenza conta.
 */
export async function chiudiSenzaRiscontro(a: RichiestaAcquisto): Promise<void> {
  const nota = [
    a.noteEsito,
    `Chiusa automaticamente il ${dataBreve(new Date().toISOString())}: nessun riscontro dal richiedente entro i giorni previsti. La consegna è presunta, non confermata.`,
  ]
    .filter(Boolean)
    .join('\n')

  await aggiornaAcquisto(a.spItemId, {
    Stato: 'Consegnata',
    EsitoConsegna: ESITO_SENZA_RISCONTRO,
    NoteEsito: nota,
    DataConsegnaEffettiva: new Date().toISOString(),
  })

  const aggiornata = await getAcquistoById(a.spItemId)
  await generaCostoDaAcquisto(aggiornata)
}
