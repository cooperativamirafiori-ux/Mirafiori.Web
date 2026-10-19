/**
 * Preventivi — tipi e costanti condivise fra server e schermate.
 *
 * Piano: docs/preventivi.md (riunione con Andrea del 19/10/2026) dentro il
 * disegno più ampio di docs/fatturazione-attiva-piano.md.
 *
 * Tre liste SharePoint (scripts/provision-preventivi.mjs):
 *   - Tariffario Preventivi: le voci con prezzo e periodo di validità;
 *   - Preventivi: un item per preventivo, le righe in JSON;
 *   - Contatti Preventivi: assistenti sociali, NPI, referenti a cui si manda.
 *
 * Le liste di scelta qui sotto vengono dal file Preventivo_MASTER.xlsx di
 * Andrea (foglio MATRICE) e dalla sua Nuova Tabella Generale (foglio Dati).
 */

/** Il modulo da compilare: corrisponde ai tre fogli del file master, più uno libero. */
export const MODELLI = {
  individuale: 'Progetto individuale',
  comunita: 'Comunità',
  artemisia: 'Casa Artemisia',
  libero: 'Altro (privati, scuole, coperture)',
} as const
export type Modello = keyof typeof MODELLI
export const ELENCO_MODELLI = Object.keys(MODELLI) as Modello[]

export const UNITA = {
  ora: { etichetta: 'ora', plurale: 'ore' },
  giorno: { etichetta: 'giorno', plurale: 'giorni' },
  km: { etichetta: 'km', plurale: 'km' },
  mese: { etichetta: 'mese', plurale: 'mesi' },
  forfait: { etichetta: 'forfait', plurale: 'forfait' },
} as const
export type Unita = keyof typeof UNITA

/**
 * Regime IVA della voce. `fic` = spese F.I.C. (budget, quota ospitalità):
 * escluse dalla base imponibile ex art. 15 DPR 633/72, come nel file master.
 */
export const REGIMI_IVA = {
  iva5: { etichetta: 'IVA 5%', aliquota: 5 },
  iva22: { etichetta: 'IVA 22%', aliquota: 22 },
  esente: { etichetta: 'Esente', aliquota: 0 },
  fic: { etichetta: 'Spese F.I.C. (escl. art. 15)', aliquota: 0 },
} as const
export type RegimeIva = keyof typeof REGIMI_IVA

/** Ambito tariffario: le voci "Tutti" valgono ovunque, le altre solo nel loro ambito. */
export const AMBITI = ['Tutti', 'Comune di Torino e ASL Torino', 'Fuori Torino', 'Privati'] as const
export type Ambito = (typeof AMBITI)[number]

/** Sezioni del documento, nell'ordine in cui compaiono. */
export const GRUPPI = [
  'Retta',
  'Intervento educativo',
  'Intervento sociosanitario',
  'Prestazioni aggiuntive',
  'Supervisione',
  'Intervento sanitario',
  'Attività a valenza riabilitativa',
  'Altre prestazioni',
  'Budget',
  'Rimborso chilometrico',
] as const

/**
 * Settimane in un mese, per passare dal monte ore settimanale a quello mensile.
 * 4,35 è il fattore che risulta dalle schede di Andrea (10 h/settimana →
 * 43,5 h "da effettuare" nel mese).
 */
export const SETTIMANE_MESE = 4.35

/** Tipi di progetto / intervento (MATRICE). Si può anche scrivere altro. */
export const TIPI_PROGETTO = [
  'Progetto Atipico',
  'Progetto Preventivo Mirato (PPM)',
  'PPM - Genitorialità Positiva',
  'Sostegno Famiglia Affidataria',
  'Post Dimissioni',
  'PIPPI',
  'Alta Intensità',
  'Intervento di educativa individualizzata',
  'Educativa Sanitaria',
  'Genitorialità positiva',
  'Accoglienza presso struttura CASA ARTEMISIA',
  'Accompagnamento luoghi neutri',
  'Inserimento diurno comunità educativa',
  'Inserimento residenziale comunità educativa',
  'Inserimento residenziale comunità riabilitativa psicosociale',
  'Copertura ospedaliera',
  'Intervento a scuola',
  'Intervento a domicilio',
] as const

/** Ripartizione della spesa fra Comune e ASL (MATRICE). */
export const RIPARTIZIONI = [
  '100% Comune',
  '100% ASL',
  '30% Comune - 70% ASL',
  '40% Comune - 60% ASL',
  '50% Comune - 50% ASL',
  'Primi due mesi 100% ASL poi 40% Comune - 60% ASL',
  'Primi due mesi 100% ASL poi 50% Comune - 50% ASL',
  'Primo mese 100% ASL poi 40% Comune - 60% ASL',
  'Primo mese 100% ASL poi 50% Comune - 50% ASL',
  'Privato',
] as const

/** Enti a cui si fanno preventivi (foglio Dati della tabella di Andrea). */
export const ENTI_SUGGERITI = [
  'Comune di Torino',
  'ASL Città di Torino',
  'ASL TO1',
  'ASL TO2',
  'ASL TO3',
  'ASL TO4',
  'ASL TO5',
  'AUSL Valle d’Aosta',
  'C.I. di S. Beinasco-Bruino-Orbassano-Piossasco-Rivalta-Volvera',
  'CIS Ciriè',
  'CISA 12',
  'CISS Chivasso',
  'CISSA Pianezza',
  'C.I.S.S. Pinerolo',
  'Con.I.S.A. val di Susa e Val Sangone',
  'Consorzio OVEST SOLIDALE',
  'CSSA Chieri',
  'NET - Unione dei Comuni Nord Est Torino',
  'Unione Comuni Moncalieri, Trofarello, La Loggia',
  'Regione Valle d’Aosta',
  'Coop. CITTATTIVA',
] as const

export const RUOLI_CONTATTO = ['Assistente sociale', 'NPI', 'Referente', 'Famiglia', 'Scuola', 'Altro'] as const

/**
 * Sottocartelle di "Preventivi" su SharePoint (AMMINISTRAZIONE/CLIENTI/
 * Preventivi): i preventivi accettati finiscono in "Preventivi accettati/<cartella>".
 */
export const CARTELLE = [
  'Ambientale',
  'GIULIA',
  'GIULIA_Inserimenti diurni',
  'CRP',
  'Artemisia',
  'Scuole',
  'Privati',
  'Ospedale',
  'Pippi',
  'Faro',
  'Altro',
] as const

export const CARTELLA_DEFAULT: Record<Modello, string> = {
  individuale: 'Ambientale',
  comunita: 'GIULIA',
  artemisia: 'Artemisia',
  libero: 'Altro',
}

/** Giorni al mese proposti per le rette (il master usa 31 per Casa Artemisia). */
export const GIORNI_RETTA_DEFAULT: Record<Modello, number> = {
  individuale: 30,
  comunita: 30,
  artemisia: 31,
  libero: 30,
}

// ============================================================
// Tariffario
// ============================================================

export interface Tariffa {
  spItemId: string
  /** Chiave stabile della voce: lega fra loro i periodi di validità dello stesso prezzo. */
  codice: string
  voce: string
  gruppo: string
  unita: Unita
  prezzo: number
  /** Prezzo bloccato: il servizio non lo cambia. Se false si sceglie fra min e max. */
  bloccato: boolean
  min: number | null
  max: number | null
  iva: RegimeIva
  modelli: Modello[]
  ambito: Ambito
  dal: string // YYYY-MM-DD
  al: string | null
  ordine: number
  note: string
}

// ============================================================
// Preventivo
// ============================================================

export interface RigaPreventivo {
  codice: string
  voce: string
  gruppo: string
  unita: Unita
  prezzo: number
  iva: RegimeIva
  /** Quantità al mese (ore, giorni, km, forfait). Per il km: accompagnamenti × km. */
  quantita: number
  /** Facoltativo, per ore e giorni: se c'è, la quantità mensile è × SETTIMANE_MESE. */
  perSettimana: number | null
  percorso?: string
  accompagnamenti?: number | null
  kmAccompagnamento?: number | null
  nota?: string
}

export const STATI_PREVENTIVO = {
  bozza: { etichetta: 'Bozza', tono: 'neutro' },
  emesso: { etichetta: 'Inviato, in attesa', tono: 'ambra' },
  accettato: { etichetta: 'Accettato', tono: 'verde' },
  rifiutato: { etichetta: 'Rifiutato', tono: 'rosso' },
  annullato: { etichetta: 'Annullato', tono: 'neutro' },
} as const
export type StatoPreventivo = keyof typeof STATI_PREVENTIVO

export interface DestinatarioPreventivo {
  ente: string
  nome: string
  ruolo: string
  email: string
}

/** Quello che compila il servizio: il resto (numero, stato, date) lo mette l'app. */
export interface DatiPreventivo {
  modello: Modello
  ccCodice: string
  cartella: string
  ambito: Ambito
  destinatario: DestinatarioPreventivo
  beneficiario: string
  oggetto: string
  tipoProgetto: string
  ripartizione: string
  dal: string
  al: string
  righe: RigaPreventivo[]
  note: string
}

export interface Preventivo extends DatiPreventivo {
  spItemId: string
  /** "PR-001/2026" — vuoto finché è una bozza mai inviata. */
  numero: string
  anno: number | null
  progressivo: number | null
  revisione: number
  ccNome: string
  stato: StatoPreventivo
  totaleMensile: number
  creatoDa: string
  creatoDaNome: string
  creatoIl: string
  emessoIl: string | null
  esitoIl: string | null
  esitoDa: string
  notaEsito: string
  pdfUrl: string
  precedenteId: string
  ultimoSollecito: string | null
}

export interface TotaliPreventivo {
  /** Somme per sezione del documento, nell'ordine di GRUPPI. */
  perGruppo: { gruppo: string; importo: number }[]
  imponibile: Record<'iva5' | 'iva22', number>
  iva: number
  esente: number
  fic: number
  /** Totale spese senza IVA (imponibili + esenti, F.I.C. escluse). */
  spese: number
  /** Costo totale mensile dell'intervento, IVA compresa, F.I.C. comprese. */
  mensileIvato: number
  /** Totale a pagare senza IVA (spese + F.I.C.). */
  mensileSenzaIva: number
  mesi: number
  /** Totale sul periodo, IVA compresa. */
  periodo: number
}

/** Il numero di protocollo nei nomi di file: "PR-001/2026" → "PR-001-2026". */
export const numeroPerFile = (numero: string) => numero.replace(/\//g, '-')

export const formattaNumero = (progressivo: number, anno: number) =>
  `PR-${String(progressivo).padStart(3, '0')}/${anno}`
