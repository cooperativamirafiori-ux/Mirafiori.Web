// ============================================================
// CONTROLLO DI GESTIONE · Registro analitico
//
// Tipi condivisi fra lib/gestione, le API route e l'interfaccia.
// Lo schema e il perché di ogni vincolo: supabase/gestione_schema.sql.
// Il piano completo: docs/controllo-di-gestione-piano.md.
// ============================================================

// ------------------------------------------------------------
// Il segnaposto dei non attribuiti
// ------------------------------------------------------------
/**
 * Centro di costo dei documenti che il sistema non ha saputo attribuire.
 *
 * È una riga vera dell'anagrafica, non un valore nullo, e non è una scelta di
 * comodo: con `cc_codice` nullable il vincolo di unicità del registro non
 * funzionerebbe — in PostgreSQL due NULL non collidono — e lo stesso documento
 * potrebbe rientrare infinite volte senza centro di costo.
 *
 * Il totale che porta è la misura della salute del sistema: va guardato, non
 * filtrato via.
 */
export const CC_DA_ATTRIBUIRE = 'DA_ATTRIBUIRE'

// ------------------------------------------------------------
// Anagrafiche
// ------------------------------------------------------------

/** Riga dello specchio Supabase della lista SharePoint Centri di Costo. */
export interface CentroDiCostoRegistro {
  codice: string          // cc1…cc23, oppure DA_ATTRIBUIRE
  nome: string
  area?: string
  ordine: number
  attivo: boolean
}

/** Costo o ricavo. Determina anche il segno ammesso dell'importo. */
export type TipoMovimento = 'costo' | 'ricavo'

/**
 * Voce del piano dei conti analitico: **di cosa** è fatta la spesa, mentre il
 * centro di costo dice **per chi**. Una ventina di voci: con cinquanta nessuno
 * classifica più niente.
 */
export interface VoceAnalitica {
  codice: string          // 'ALIM', 'UTEN', 'PROF'…
  nome: string
  tipo: TipoMovimento
  voceBilancio?: string   // il ponte verso il bilancio civilistico: B6, B7…
  ordine: number
}

// ------------------------------------------------------------
// Il registro
// ------------------------------------------------------------

/**
 * Da quale flusso nasce la riga. Serve a sapere, guardando un totale, da dove
 * viene — e a rifare l'import di una sola sorgente senza toccare le altre.
 */
export type FonteMovimento =
  | 'acquisto'          // richiesta d'acquisto consegnata
  | 'manutenzione'      // ticket chiuso con un costo
  | 'costo_diretto'     // inserimento a mano sulla lista Costi
  | 'lavoro'            // costo del personale ripartito dalle timbrature
  | 'fattura_passiva'   // fattura ricevuta dallo SDI
  | 'spesa_dichiarata'  // dichiarazione di spesa estera (le altre non sono un costo)
  | 'spesa_carta'       // transazione con carta, centro di costo dall'etichetta
  | 'fattura_attiva'    // richiesta fattura emessa
  | 'convenzione'       // rette e convenzioni maturate per competenza
  | 'contributo'        // bandi e liberalità, quota di competenza
  | 'incasso'           // corrispettivi diretti (registratore di cassa)
  | 'uscita_manuale'    // scadenza fuori SDI classificata come costo
  | 'manuale'           // rettifica inserita da una persona

/**
 * Quanto ci si può credere, sull'attribuzione al centro di costo. Non è una
 * sfumatura: è ciò che distingue un numero da guardare da un numero da
 * verificare, e va mostrato in ogni elenco.
 */
export type Confidenza =
  | 'certa'          // il centro di costo era già scritto sul documento
  | 'alta'           // dedotto da un appaiamento o da un'etichetta
  | 'convenzionale'  // ripartito con una regola: è una convenzione, non un fatto
  | 'manuale'        // deciso da una persona
  | 'da_attribuire'  // nessuna risposta. Unico valore ammesso col segnaposto

/**
 * Una riga del registro, come la scrive chi la produce.
 *
 * `importo` va firmato: negativo per i costi, positivo per i ricavi. Non è una
 * convenzione da ricordare — il database rifiuta un costo positivo.
 */
export interface RigaRegistro {
  dataCompetenza: string    // ISO yyyy-mm-dd. La data del documento
  dataCassa?: string        // solo dall'appaiamento bancario, mai digitata
  ccCodice: string
  tipo: TipoMovimento
  voce?: string             // vuota se non ancora classificata
  importo: number           // < 0 costo, > 0 ricavo
  controparte?: string
  piva?: string
  fonte: FonteMovimento
  confidenza: Confidenza
  motivo?: string           // perché il sistema ha deciso così
  quota?: number            // < 1 se il documento è ripartito su più CC
  note?: string
  creatoDa?: string
}

/** Una riga del registro come torna dal database. */
export interface MovimentoRegistro extends RigaRegistro {
  id: string
  origineTipo: string
  origineId: string
  quota: number
  creatoIl: string
}

// ------------------------------------------------------------
// Letture di aggregazione
// ------------------------------------------------------------
// I costi tornano **positivi**: il segno negativo del registro è un vincolo di
// coerenza interna, non un modo di presentare un numero a chi legge.

/** Una riga del cruscotto per centro di costo. */
export interface TotaliCentroDiCosto {
  ccCodice: string
  ccNome: string
  area?: string
  costi: number
  ricavi: number
  righe: number
}

/** Una riga del cruscotto per voce analitica. */
export interface TotaliVoce {
  voce?: string
  voceNome: string        // 'Da classificare' quando la voce è vuota
  tipo: TipoMovimento
  totale: number
  righe: number
}
