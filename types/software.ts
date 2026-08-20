/**
 * Tipi per la sezione Amministrazione → Gestione Software.
 * Archivio dei servizi/abbonamenti software della cooperativa.
 */

export const CATEGORIE_SOFTWARE = [
  'Contabilità',
  'Comunicazione',
  'Design',
  'Sviluppo',
  'Cloud / Hosting',
  'Sicurezza',
  'Produttività',
  'Altro',
] as const
export type CategoriaSoftware = (typeof CATEGORIE_SOFTWARE)[number]

export const PERIODICITA_SOFTWARE = ['Mensile', 'Annuale', 'Una tantum', 'Altro'] as const
export type PeriodicitaSoftware = (typeof PERIODICITA_SOFTWARE)[number]

export const STATI_SOFTWARE = ['Attivo', 'In scadenza', 'Disdetto', 'Da valutare'] as const
export type StatoSoftware = (typeof STATI_SOFTWARE)[number]

export interface Software {
  /** ID riga SharePoint (string, usato dalle API Graph) */
  spItemId: string
  /** Nome del servizio (colonna Title in SP) */
  servizio: string
  categoria: string
  /**
   * Centro di costo su cui ricade l'abbonamento (lookup → Centri di Costo).
   * `undefined` solo sulle righe inserite prima che il campo esistesse: da qui
   * in avanti il form e le API lo pretendono.
   */
  centroCosto?: { id: number; value: string }
  /** Username / email dell'account */
  account: string
  /** Password — salvata in chiaro su SharePoint (scelta dell'utente) */
  password: string
  /** URL del portale di login */
  linkPortale: string
  /** Chi ha in uso il servizio (testo libero) */
  referente: string
  /** Costo dell'abbonamento */
  costo?: number
  periodicita: string
  /** Rinnovo automatico sì/no */
  rinnovoAutomatico: boolean
  /** Data di scadenza/rinnovo (YYYY-MM-DD) */
  scadenza?: string
  /** Carta usata per il pagamento (es. "Visa •1234 — Mario Rossi") */
  cartaPagamento: string
  stato: string
  /** URL della fattura caricata su SharePoint */
  fatturaUrl: string
  /** Nome file della fattura */
  fatturaNome: string
  note: string
  /** Calendari Outlook (email, separate da virgola) dove creare l'evento di scadenza */
  calendarEmails: string
  /** Mappa email→eventId degli eventi creati (per aggiornarli/cancellarli) */
  calendarEventi: Record<string, string>
}

/** Payload di creazione/aggiornamento dal form */
export interface SoftwareInput {
  servizio: string
  categoria: string
  /** ID riga SharePoint del centro di costo — obbligatorio */
  centroCostoId: number
  account: string
  password: string
  linkPortale: string
  referente: string
  costo?: number | null
  periodicita: string
  rinnovoAutomatico: boolean
  scadenza?: string | null
  cartaPagamento: string
  stato: string
  note: string
  calendarEmails: string
}
