/**
 * Preventivi — tipi e costanti condivise fra server e schermate.
 *
 * Piano: docs/preventivi.md (riunione con Andrea del 19/10/2026) dentro il
 * disegno più ampio di docs/fatturazione-attiva-piano.md.
 *
 * Quattro liste SharePoint (scripts/provision-preventivi.mjs):
 *   - Tariffario Preventivi: la matrice di Andrea, una riga per
 *     Servizio + Sottotipo + Voce + Ente pagante, con periodo di validità;
 *   - Enti Preventivi: gli enti, col nome usato in fattura;
 *   - Preventivi: un item per preventivo, le righe in JSON;
 *   - Contatti Preventivi: assistenti sociali, NPI, referenti a cui si manda.
 *
 * Dal 20/11/2026 il tariffario è la Matrice_App_Preventivi.xlsx di Andrea
 * (caricata con scripts/preventivi-carica-matrice.mjs): niente più modelli,
 * ambiti e prezzi liberi fra un minimo e un massimo.
 */

/**
 * Permesso "Preventivi" (06/11/2026): fa vedere e fare i preventivi di TUTTI i
 * centri di costo, con tariffario, ISTAT e prezzi fuori limite — come
 * Amministrazione, ma senza aprire il resto del pannello (password, permessi).
 * Nato per Andrea Granato.
 */
export const AREA_PREVENTIVI = 'Preventivi'

export const UNITA = {
  ora: { etichetta: 'ora', plurale: 'ore' },
  giorno: { etichetta: 'giorno', plurale: 'giorni' },
  km: { etichetta: 'km', plurale: 'km' },
  mese: { etichetta: 'mese', plurale: 'mesi' },
  incontro: { etichetta: 'incontro', plurale: 'incontri' },
  forfait: { etichetta: 'forfait', plurale: 'forfait' },
} as const
export type Unita = keyof typeof UNITA

/**
 * Regime IVA della voce. `fic` = spese F.I.C. (rimborso km, pedaggi, budget,
 * quota ospitalità): escluse dalla base imponibile ex art. 15 DPR 633/72.
 * Nella matrice di Andrea: «5%» o «Esclusa».
 */
export const REGIMI_IVA = {
  iva5: { etichetta: 'IVA 5%', aliquota: 5 },
  iva22: { etichetta: 'IVA 22%', aliquota: 22 },
  esente: { etichetta: 'Esente', aliquota: 0 },
  fic: { etichetta: 'Esclusa (F.I.C., art. 15)', aliquota: 0 },
} as const
export type RegimeIva = keyof typeof REGIMI_IVA

// ============================================================
// Enti (matrice di Andrea, 20/11/2026)
// ============================================================

/** Valori speciali della colonna "Ente pagante" del tariffario. */
export const ENTE_TUTTI = 'Tutti'
/** Tariffa per ogni ente non elencato espressamente per quella voce. */
export const ENTE_ALTRI = 'Tutti gli altri enti'

/**
 * Chiavi stabili di alcuni enti nella lista "Enti Preventivi": il nome si può
 * correggere dalla schermata Enti, la chiave no. Servono a formare le coppie
 * di Torino e a riconoscere i privati.
 */
export const CHIAVI_ENTE = {
  comuneTorino: 'comune-torino',
  aslTo1: 'asl-to1',
  aslTo2: 'asl-to2',
  privato: 'privato',
} as const

/**
 * Le due coppie di Torino (decisione di Dennis, 20/11/2026): Comune di Torino
 * e una delle due ASL Città di Torino vanno sempre insieme. Il preventivo va a
 * entrambi e porta le due quote (Comune e ASL) con il totale.
 */
export const COPPIE_TORINO = {
  'coppia:asl-to1': { etichetta: 'Comune di Torino + ASL Città di Torino 1', chiavi: ['comune-torino', 'asl-to1'] },
  'coppia:asl-to2': { etichetta: 'Comune di Torino + ASL Città di Torino 2', chiavi: ['comune-torino', 'asl-to2'] },
} as const
export type SceltaCoppia = keyof typeof COPPIE_TORINO
export const ePrivato = (servizio: string) => /^privat/i.test(servizio.trim())

export interface Ente {
  spItemId: string
  /** Intestazione usata nelle fatture: è anche il nome che lega l'ente al tariffario. */
  nome: string
  chiave: string
  /** Promemoria libero: per quali servizi è stato fatturato. */
  servizi: string
  attivo: boolean
  note: string
}

/**
 * Maggiorazione facoltativa dei preventivi ai privati (spunta, 20/11/2026):
 * +5% sul costo, prima dell'IVA. Le spese F.I.C. restano fuori.
 */
export const MAGGIORAZIONE_PRIVATI = 5

/** Lavoro indiretto dei privati: 0,5 h a settimana al costo orario, se serve. */
export const ORE_INDIRETTE_SETTIMANA = 0.5
export const SUFFISSO_INDIRETTO = '#IND'

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

/** Cartella proposta per un servizio della matrice (si può cambiare). */
export function cartellaPerServizio(servizio: string, sottotipo = ''): string {
  const s = servizio.toLowerCase()
  if (/pippi/i.test(sottotipo)) return 'Pippi'
  if (s.startsWith('privat')) return 'Privati'
  if (s.includes('artemisia')) return 'Artemisia'
  if (s.includes('giulia') && s.includes('diurno')) return 'GIULIA_Inserimenti diurni'
  if (s.includes('giulia')) return 'GIULIA'
  if (s.startsWith('crp')) return 'CRP'
  if (s.startsWith('scuol')) return 'Scuole'
  if (s.includes('ospedal')) return 'Ospedale'
  if (s.includes('progetto individuale')) return 'Ambientale'
  return 'Altro'
}

/**
 * Giorni al mese proposti per le rette: 31 per tutti (Andrea, 18/11/2026),
 * così nel preventivo compare sempre la cifra più alta possibile.
 */
export const GIORNI_RETTA = 31

/** Durata proposta per un preventivo nuovo, in mesi. */
export const DURATA_DEFAULT = 6

// ============================================================
// Tariffario
// ============================================================

/**
 * Una riga della matrice di Andrea: Servizio + Sottotipo + Voce + Ente pagante
 * → prezzo. Il prezzo vuoto (`null`) vuol dire "da definire": lo scrive chi fa
 * il preventivo.
 */
export interface Tariffa {
  spItemId: string
  /** Chiave stabile della riga: lega fra loro i periodi di validità dello stesso prezzo. */
  codice: string
  servizio: string
  /** Vuoto = vale per tutti i sottotipi del servizio. */
  sottotipo: string
  voce: string
  /** Nome dell'ente (come nella lista Enti), oppure ENTE_TUTTI / ENTE_ALTRI. */
  ente: string
  /** Sezione del documento (GRUPPI). */
  gruppo: string
  unita: Unita
  prezzo: number | null
  iva: RegimeIva
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

/** Una persona a cui va il preventivo (assistente sociale, NPI, famiglia…) o un referente. */
export interface Persona {
  nome: string
  ruolo: string
  ente: string
  email: string
}

/** Quello che compila il servizio: il resto (numero, stato, date) lo mette l'app. */
export interface DatiPreventivo {
  ccCodice: string
  cartella: string
  servizio: string
  sottotipo: string
  /**
   * L'ente scelto: una chiave di COPPIE_TORINO, il nome di un ente della lista
   * Enti, oppure vuoto (privati: l'ente non c'è).
   */
  ente: string
  persone: Persona[]
  beneficiario: string
  oggetto: string
  tipoProgetto: string
  ripartizione: string
  /** Data di inizio; vuota = "da definire". */
  dal: string
  durataMesi: number
  righe: RigaPreventivo[]
  note: string
  /** Solo privati: +MAGGIORAZIONE_PRIVATI% sul costo. */
  maggiorazione: boolean
  /** Solo privati: secondo referente facoltativo (il primo è chi fa il preventivo). */
  referente2: Persona | null
}

export interface Preventivo extends DatiPreventivo {
  spItemId: string
  /** "PR-001/2026" — vuoto finché è una bozza mai inviata. */
  numero: string
  anno: number | null
  progressivo: number | null
  revisione: number
  ccNome: string
  /** Fine del periodo, calcolata da inizio e durata; vuota se l'inizio è da definire. */
  al: string
  /** I nomi degli enti a cui va, come si sono risolti al salvataggio (la coppia di Torino sono due). */
  enti: string[]
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
  /** Maggiorazione dei privati, già compresa negli imponibili qui sotto. */
  maggiorazione: number
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
