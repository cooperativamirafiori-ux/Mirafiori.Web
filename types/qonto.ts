/**
 * Conti Qonto come li vede l'app: il conto principale e un sottoconto per
 * centro di costo, riconosciuto dal codice all'inizio del nome
 * ("cc18 · Condominio Solidale").
 */

export interface ContoQonto {
  id: string
  /** Nome per le persone: senza il prefisso "ccN · ". */
  nome: string
  /** Nome esatto su Qonto. */
  nomeQonto: string
  iban: string
  /** cc1…cc23, oppure null per il conto principale e i conti non agganciati. */
  ccCodice: string | null
  principale: boolean
  /** Contabile. null se la chiave non ha il permesso di vedere i saldi. */
  saldo: number | null
  /** Tolti i pagamenti con carta ancora in attesa: quello che si può spendere adesso. */
  saldoDisponibile: number | null
  valuta: string
}

export interface MovimentoQonto {
  id: string
  data: string
  controparte: string
  /** Positivo = entrata, negativo = uscita. */
  importo: number
  stato: 'pending' | 'completed' | 'declined' | 'reversed'
  tipo: string
  nota: string | null
  riferimento: string | null
  conAllegato: boolean
  allegatoObbligatorio: boolean
  carta: string | null
}
