// ============================================================
// CONTROLLO DI GESTIONE · Flussi fatture
//
// Tipi condivisi fra lib/pagamenti, le API route e l'interfaccia.
// Le decisioni e il perché stanno in docs/flussi-fatture.md, il piano
// completo in docs/controllo-di-gestione-piano.md.
// ============================================================

// ------------------------------------------------------------
// Permessi
// ------------------------------------------------------------
// Tre permessi distinti, si concedono da Amministrazione › Permessi.
// Il primo apre i cruscotti (in futuro, a molte persone), gli altri due i
// flussi fatture. Tenerli separati è il motivo per cui un coordinatore potrà
// guardare il proprio centro di costo senza vedere una singola scadenza.

/** Cruscotti dei costi e dei ricavi. Da solo NON apre i Flussi fatture. */
export const AREA_CONTROLLO_GESTIONE = 'Controllo di Gestione'

/** Flussi fatture: caricamento del file, coda DA PAGARE, tasto PAGATA. */
export const AREA_PAGAMENTI = 'Pagamenti'

/** Tasto APPROVA sulle scadenze sopra soglia. */
export const AREA_APPROVAZIONE_PAGAMENTI = 'Approvazione Pagamenti'

// ------------------------------------------------------------
// Stati della scadenza
// ------------------------------------------------------------
// Solo due transizioni passano da una persona: APPROVA (chi approva) e
// PAGATA (amministrazione). Tutte le altre le decide la modalità di pagamento
// al momento dell'import.
export type StatoScadenza =
  | 'da_approvare' // sopra soglia, aspetta l'approvazione
  | 'da_pagare'    // sotto soglia, oppure approvata
  | 'pagata'       // clic dell'amministrazione (domani: estratto conto)
  | 'automatica'   // RID/SDD/domiciliazione: esce da sola, nessuno la tocca
  | 'storica'      // sotto la data di decorrenza: fuori dalle code
  | 'stornata'     // annullata da una nota di credito

/**
 * Famiglia della modalità di pagamento, ricavata dalla `Tipologia` del file.
 *
 * ⚠️ La `Tipologia` è la modalità che dichiara il FORNITORE (campo
 * ModalitàPagamento dell'XML), non come abbiamo pagato noi. Funziona perché
 * nei negozi il fornitore sa come ha incassato — ma è una dichiarazione
 * altrui, ed è la ragione per cui esiste l'avviso sul doppio pagamento.
 */
export type FamigliaModalita =
  | 'bonifico'   // passa dalle code: qualcuno deve decidere e pagare
  | 'negozio'    // contanti o carta: il denaro è già uscito
  | 'automatica' // RID, SDD, domiciliazione, MAV, PagoPA, quietanza erario
  | 'altro'

export type TipoDocumento = 'fattura' | 'nota_credito'

// ------------------------------------------------------------
// Uscite senza fattura
// ------------------------------------------------------------
// I costi con scadenza che non passano dallo SDI — F24, tributi, contributi,
// rate, ricariche delle carte — non sono un oggetto nuovo: sono scadenze senza
// fattura, nella stessa tabella e nelle stesse code. Vedi
// docs/uscite-senza-fattura.md e supabase/uscite_manuali.sql.

/** Chi ha creato la riga: l'import dello scadenzario, o una persona. */
export type OrigineScadenza = 'sdi' | 'manuale'

/**
 * Costo o movimento di cassa. Vale solo sulle righe inserite a mano: una
 * fattura è sempre un costo.
 *
 *  - `costo`  → prima o poi va attribuito a un centro di costo
 *  - `flusso` → serve solo a previsione e fabbisogno di cassa
 *
 * Non è una sottigliezza contabile: la rata di un debito, una ricarica delle
 * carte e la restituzione di una quota sociale escono dal conto senza essere
 * un costo di quest'anno, e contarle fra i costi gonfierebbe i centri di costo
 * di somme già registrate altrove.
 */
export type NaturaUscita = 'costo' | 'flusso'

/** Quello che si scrive nella mascherina. */
export interface NuovaUscita {
  oggetto: string
  dataScadenza: string
  importo: number
  natura: NaturaUscita
  note?: string
}

/** Etichette dei due valori di `natura`, per la mascherina e per l'elenco. */
export const NATURE: ReadonlyArray<{ valore: NaturaUscita; etichetta: string; aiuto: string }> = [
  {
    valore: 'costo',
    etichetta: 'Costo',
    aiuto: 'Un costo dell’anno: andrà attribuito a un centro di costo',
  },
  {
    valore: 'flusso',
    etichetta: 'Solo movimento di cassa',
    aiuto: 'Esce dal conto ma non è un costo di quest’anno: rate di debiti, giroconti, restituzioni',
  },
]

// ------------------------------------------------------------
// Righe delle code
// ------------------------------------------------------------

export interface RigaScadenza {
  id: string
  /**
   * Nulli sulle righe inserite a mano: non hanno una fattura dietro.
   * Chi legge una riga guarda `titolo`, che sa già quale dei due usare.
   */
  fatturaId: string | null
  fornitore: string | null
  piva: string | null
  /** Numero e data della fattura come li conosce il fornitore. */
  numeroFornitore: string | null
  dataFornitore: string | null
  /** Protocollo interno del gestionale, per ritrovarla in Fattura SMART. */
  protocollo: string | null
  /** Cosa si paga, sulle righe senza fattura. Null su quelle dello SDI. */
  oggetto: string | null
  /**
   * Come si chiama la riga in elenco: il fornitore se viene da una fattura,
   * l'oggetto se l'ha scritta una persona. Calcolato in lettura, così
   * l'interfaccia non deve conoscere la differenza.
   */
  titolo: string
  origine: OrigineScadenza
  /** Solo sulle righe a mano: distingue un costo da un movimento di cassa. */
  natura: NaturaUscita | null
  note: string | null
  inseritaDa: string | null
  dataScadenza: string
  importo: number
  modalita: string | null
  famiglia: FamigliaModalita
  tipoDocumento: TipoDocumento
  stato: StatoScadenza
  stimata: boolean
  alert: 'possibile_doppio_pagamento' | null
  segnalazione: string | null
  scomparsa: boolean
  dataPagamento: string | null
  pagataDa: string | null
  /** Chi ha detto che è pagata: il clic, lo stato del gestionale, la banca. */
  originePagamento: 'app' | 'gestionale' | 'banca' | null
  approvataDa: string | null
  approvataIl: string | null
  /** Giorni di attesa in coda: rende visibile il silenzio di chi non decide. */
  giorniAttesa: number
  /** Giorni di ritardo sulla scadenza; 0 se non è ancora scaduta. */
  giorniRitardo: number
}

export interface Totale {
  righe: number
  importo: number
}

export interface TotaliCoda {
  scaduto: Totale
  /**
   * Finestre **cumulative** da oggi: «entro 60» comprende «entro 30», come si
   * legge la frase. Non comprendono lo scaduto, che ha una piastrella sua.
   */
  entro7: Totale
  entro30: Totale
  entro60: Totale
  entro90: Totale
  daApprovare: Totale
  daPagare: Totale
  /**
   * Gli addebiti automatici in arrivo, a parte, per la spunta «previsione
   * completa». Solo il futuro: un RID con data passata è già uscito dal conto,
   * non è uno scaduto da pagare.
   */
  automatiche: {
    entro7: Totale
    entro30: Totale
    entro60: Totale
    entro90: Totale
  }
}

// ------------------------------------------------------------
// Ricevuta dell'import
// ------------------------------------------------------------

export interface RicevutaImport {
  id: string
  nomeFile: string
  caricatoDa: string
  caricatoIl: string
  righe: number
  nuove: number
  aggiornate: number
  invariate: number
  scartate: number
  scomparse: number
  soglia: number
  esito: 'ok' | 'errore'
  /** Motivi degli scarti, aggregati: «12 righe senza data di scadenza». */
  avvisi: string[]
}

/** Soglia di riserva se la lista SP Parametri non risponde o non ha la riga. */
export const SOGLIA_APPROVAZIONE_DEFAULT = 1500

/** Chiave della riga nella lista SharePoint "Parametri". */
export const CHIAVE_PARAMETRO_SOGLIA = 'SogliaApprovazionePagamenti'
