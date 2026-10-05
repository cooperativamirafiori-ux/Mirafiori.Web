/**
 * Cruscotto del controllo di gestione — i tipi.
 *
 * Il cruscotto riceve dal server un oggetto già calcolato (`DatiCruscotto`) e
 * non fa altri conti che filtri e ordinamenti: così i numeri che vede un
 * coordinatore e quelli che vede l'amministrazione escono dalla stessa funzione
 * (`costruisciCruscotto` in lib/gestione/cruscotto-calcoli.ts).
 *
 * Tutti gli importi sono in euro, IVA ESCLUSA (imponibile), e i costi sono
 * POSITIVI (nel registro sono negativi: qui si legge, non si scrive).
 * Le fatture passive sono solo quelle arrivate come XML dallo SDI.
 */

/** Dodici numeri, gennaio → dicembre. */
export type Mesi = number[]

export interface RigaDettaglio {
  data: string            // YYYY-MM-DD
  chi: string             // fornitore, o causale del costo inserito a mano
  numero?: string
  importo: number
  fonte: 'fattura' | 'diretto' | 'ricavo'
}

export interface FornitoreTop {
  nome: string
  importo: number
  n: number
}

export interface CentroCruscotto {
  codice: string
  nome: string
  area: string
  /** Fatture passive segnate su questo centro di costo. */
  costiFatture: number
  nFatture: number
  /** Costi inseriti a mano (Manutenzioni → Inserisci costo, Costi Strutture). */
  costiDiretti: number
  nDiretti: number
  /** Fatture emesse passate da "Richiesta fattura". */
  ricavi: number
  nRicavi: number
  ore: number
  persone: number
  mensileCosti: Mesi
  mensileRicavi: Mesi
  mensileOre: Mesi
  fornitori: FornitoreTop[]
  ultime: RigaDettaglio[]
  saldoQonto: number | null
  /** Solo nei dati di esempio: il budget non esiste ancora. */
  budget: number | null
}

export interface DatiCruscotto {
  anno: number
  anni: number[]
  /** Primo mese da disegnare (1-12): prima degli XML non c'è niente da mostrare. */
  meseInizio: number
  /** Ultimo mese da disegnare (1-12): i mesi futuri non sono zero, non ci sono. */
  meseUltimo: number
  esempio: boolean
  /** Vede tutta la cooperativa (true) o solo i propri centri di costo. */
  completo: boolean
  centri: CentroCruscotto[]
  fatture: {
    tutte: number
    nTutte: number
    attribuite: number
    nAttribuite: number
    mensileTutte: Mesi
    mensileAttribuite: Mesi
  }
  daAttribuire: {
    importo: number
    n: number
    fornitori: FornitoreTop[]
  }
  ricaviNonRiconosciuti: { importo: number; n: number }
  /** Fonti che non hanno risposto: il cruscotto lo dice invece di mostrare zero. */
  avvisi: string[]
  generatoIl: string
}
