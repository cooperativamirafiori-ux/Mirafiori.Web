// ============================================================
// Tipi per la sezione Prestazioni Occasionali (ritenute d'acconto)
// Rispecchiano la SharePoint List "Prestazioni Occasionali"
// ============================================================

export type StatoPrestazione =
  | 'Bozza'
  | 'Contratto inviato'
  | 'Contratto firmato'
  | 'In corso'
  | 'Importo inserito'
  | 'Notula inviata'
  | 'Notula ricevuta'
  | 'Chiusa'

/** Dati anagrafici del prestatore (inseriti nel form o presi da anagrafica) */
export interface DatiPrestatore {
  nome: string
  cognome: string
  dataNascita: string // ISO date (YYYY-MM-DD)
  luogoNascita: string // comune di nascita, es. "Torino (TO)" — serve al contratto
  codiceFiscale: string
  residenza: string
  ruolo: string // es. "Educatrice" — serve all'autorizzazione GDPR
  email: string
  telefono: string
  iban: string // IBAN per il pagamento del compenso
}

/** Dati della prestazione */
export interface DatiPrestazione {
  giorni: number
  dataInizio: string // ISO date
  dataFine: string // ISO date
  attivita: string
  compensoPrevisto: number // compenso indicativo lordo concordato, indicato nel contratto
  casisticaGdpr: string // key della casistica GDPR (vedi lib/casistiche-gdpr.ts)
}

/** Payload inviato dal form (gli allegati viaggiano come file in FormData) */
export interface NuovaPrestazionePayload extends DatiPrestatore, DatiPrestazione {}

/** Record completo come letto da SharePoint */
export interface Prestazione extends DatiPrestatore, DatiPrestazione {
  spItemId: string
  idPrestazione: string // Title: "PREST-2026-001"
  stato: StatoPrestazione
  responsabileEmail: string
  responsabileNome: string
  cartellaUrl?: string
  importoLordo?: number
  dataInserimento: string
  // Fase chiusura / notula
  notulaToken?: string
  notulaUrl?: string
  // Promemoria foglio ore
  promemoriaOreInviato?: boolean
  // DocuSign
  docusignEnvelopeId?: string
}

/** Riferimento a una cartella creata/trovata su SharePoint */
export interface CartellaInfo {
  id: string
  webUrl: string
  path: string // path relativo nella document library
}
