/**
 * Anagrafica Clienti — tipi.
 *
 * È un'anagrafica come Strutture: vive per conto suo e la usa chi ne ha bisogno
 * (oggi solo la Richiesta Fattura). L'elenco iniziale è stato importato dal
 * gestionale di fatturazione, quindi i nomi dei campi seguono quelli di là:
 * la `nazione` è un **codice a due lettere** (IT, FR, DE), non il nome del
 * paese, perché è la forma che vuole la fattura elettronica.
 *
 * Nessun import: lo leggono sia il client sia il server.
 */

import type { TipoSoggetto } from '@/types/fatture'

export interface Cliente {
  spItemId: string
  /** Come si chiama in fattura. Per i privati contiene "COGNOME NOME". */
  denominazione: string
  cognome: string
  nome: string
  tipoSoggetto: TipoSoggetto | ''

  indirizzo: string
  comune: string
  cap: string
  provincia: string
  /** Codice ISO a due lettere: IT, FR, DE… */
  nazione: string

  partitaIva: string
  codiceFiscale: string
  /** Per i soggetti esteri senza partita IVA italiana. */
  codiceEstero: string

  cellulare: string
  telefono: string
  email: string
  pec: string

  /** Codice destinatario della fattura elettronica (7 caratteri). */
  codiceSdi: string
  /** Codice univoco ufficio per la pubblica amministrazione (6 caratteri). */
  codiceIpa: string

  scadenza: string
  tipoPagamento: string
  /** "Sì" / "No" come nel gestionale: è un dato che l'app non interpreta. */
  addebitoBollo: string
}

/**
 * La riga leggera che il modulo riceve al caricamento della pagina per fare la
 * ricerca senza chiamare il server a ogni tasto premuto. La scheda completa si
 * chiede solo quando si sceglie un cliente.
 */
export interface ClienteIndice {
  id: string
  d: string // denominazione
  cf: string // codice fiscale
  pi: string // partita IVA
  c: string // comune
}

export function indiceDa(c: Cliente): ClienteIndice {
  return {
    id: c.spItemId,
    d: c.denominazione,
    cf: c.codiceFiscale,
    pi: c.partitaIva,
    c: c.comune,
  }
}

/**
 * Testo su cui cerca la casella di ricerca: denominazione, cognome/nome,
 * partita IVA, codice fiscale, comune. Normalizzato una volta sola.
 */
export function testoRicerca(c: ClienteIndice): string {
  return `${c.d} ${c.pi} ${c.cf} ${c.c}`.toLowerCase()
}

/**
 * Cerca fra le righe leggere. Ogni parola digitata deve comparire da qualche
 * parte (non necessariamente nello stesso campo): così "miravolante panetti"
 * e "bianchi 10135" funzionano entrambi.
 */
export function cercaClienti(
  indice: ClienteIndice[],
  query: string,
  max = 8,
): ClienteIndice[] {
  const parole = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!parole.length) return []
  const trovati: ClienteIndice[] = []
  for (const c of indice) {
    const testo = testoRicerca(c)
    if (parole.every((p) => testo.includes(p))) {
      trovati.push(c)
      if (trovati.length >= max) break
    }
  }
  return trovati
}

/** Chiave d'identità di un cliente: partita IVA, o in mancanza codice fiscale. */
export function chiaveCliente(c: {
  partitaIva?: string
  codiceFiscale?: string
}): string {
  return (
    (c.partitaIva ?? '').replace(/\s/g, '').toUpperCase() ||
    (c.codiceFiscale ?? '').replace(/\s/g, '').toUpperCase()
  )
}

// ============================================================
// Nazioni
// ============================================================

/**
 * Paesi selezionabili: valore = codice ISO (quello che finisce in anagrafica e
 * in fattura), etichetta = nome italiano (quello che legge chi compila).
 *
 * Non è l'elenco completo dei paesi del mondo: ci sono quelli presenti
 * nell'anagrafica importata più i principali. `Campo` conserva un valore fuori
 * elenco mostrandolo come "(valore attuale)", quindi un cliente con un codice
 * non previsto non si rovina aprendo la sua scheda.
 */
export const NAZIONI: ReadonlyArray<{ valore: string; etichetta: string }> = [
  { valore: 'IT', etichetta: 'Italia' },
  { valore: 'AT', etichetta: 'Austria' },
  { valore: 'BE', etichetta: 'Belgio' },
  { valore: 'BR', etichetta: 'Brasile' },
  { valore: 'BG', etichetta: 'Bulgaria' },
  { valore: 'CA', etichetta: 'Canada' },
  { valore: 'CN', etichetta: 'Cina' },
  { valore: 'CY', etichetta: 'Cipro' },
  { valore: 'HR', etichetta: 'Croazia' },
  { valore: 'DK', etichetta: 'Danimarca' },
  { valore: 'EE', etichetta: 'Estonia' },
  { valore: 'FI', etichetta: 'Finlandia' },
  { valore: 'FR', etichetta: 'Francia' },
  { valore: 'DE', etichetta: 'Germania' },
  { valore: 'JP', etichetta: 'Giappone' },
  { valore: 'GR', etichetta: 'Grecia' },
  { valore: 'IE', etichetta: 'Irlanda' },
  { valore: 'LV', etichetta: 'Lettonia' },
  { valore: 'LT', etichetta: 'Lituania' },
  { valore: 'LU', etichetta: 'Lussemburgo' },
  { valore: 'MT', etichetta: 'Malta' },
  { valore: 'MA', etichetta: 'Marocco' },
  { valore: 'MD', etichetta: 'Moldavia' },
  { valore: 'NO', etichetta: 'Norvegia' },
  { valore: 'NL', etichetta: 'Paesi Bassi' },
  { valore: 'PL', etichetta: 'Polonia' },
  { valore: 'PT', etichetta: 'Portogallo' },
  { valore: 'GB', etichetta: 'Regno Unito' },
  { valore: 'CZ', etichetta: 'Repubblica Ceca' },
  { valore: 'RO', etichetta: 'Romania' },
  { valore: 'RU', etichetta: 'Russia' },
  { valore: 'SM', etichetta: 'San Marino' },
  { valore: 'RS', etichetta: 'Serbia' },
  { valore: 'SK', etichetta: 'Slovacchia' },
  { valore: 'SI', etichetta: 'Slovenia' },
  { valore: 'ES', etichetta: 'Spagna' },
  { valore: 'US', etichetta: 'Stati Uniti' },
  { valore: 'SE', etichetta: 'Svezia' },
  { valore: 'CH', etichetta: 'Svizzera' },
  { valore: 'TN', etichetta: 'Tunisia' },
  { valore: 'TR', etichetta: 'Turchia' },
  { valore: 'UA', etichetta: 'Ucraina' },
  { valore: 'HU', etichetta: 'Ungheria' },
  { valore: 'VA', etichetta: 'Città del Vaticano' },
]

/** Nome del paese da mostrare, o il codice stesso se non è in elenco. */
export function nomeNazione(codice: string): string {
  const c = (codice ?? '').trim().toUpperCase()
  return NAZIONI.find((n) => n.valore === c)?.etichetta ?? c
}
