/**
 * Tipi della sezione Timbrature (dati su Supabase/Postgres).
 * Vedi web/supabase/timbrature_schema.sql per lo schema.
 */

export type TipoVoce = 'lavoro' | 'giustificativo'

/**
 * Percorso del mese, dalla compilazione all'archiviazione.
 *
 *   aperto      il dipendente compila (finestra mobile di 3 giorni)
 *   da_validare finestra scaduta: la palla passa al responsabile diretto
 *   validato    il responsabile ha approvato; il dipendente ha ricevuto il PDF
 *   confermato  il dipendente ha dato l'ok (o il responsabile ha forzato):
 *               il foglio e' definitivo e archiviato nella cartella personale
 *   contestato  il dipendente ha segnalato un errore: torna al responsabile
 */
export type StatoMese = 'aperto' | 'da_validare' | 'validato' | 'confermato' | 'contestato'

export const ETICHETTA_STATO: Record<StatoMese, string> = {
  aperto: 'In compilazione',
  da_validare: 'Da validare',
  validato: 'Attesa conferma',
  confermato: 'Confermato',
  contestato: 'Contestato',
}

export interface Servizio {
  id: number
  nome: string
  centroCosto: number // 1-5 = lavoro, 99 = giustificativi
  categoria: string | null
  tipoVoce: TipoVoce
  attivo: boolean
  ordine: number
  /** Solo per i giustificativi: puo' essere preso anche per una fascia oraria
   *  (dalle-alle), non solo a giornata intera. Es. Ferie, Permessi retribuiti. */
  adOre: boolean
}

export interface Dipendente {
  id: number
  email: string
  cognomeNome: string
  referenteEmail: string | null
  attivo: boolean
}

export interface ProfiloOrario {
  id: number
  dipendenteId: number
  decorrenza: string // YYYY-MM-DD
  oreLun: number
  oreMar: number
  oreMer: number
  oreGio: number
  oreVen: number
  oreSab: number
  oreDom: number
  aggiornatoDa: string | null
  aggiornatoIl: string
}

/** Ore attese indicizzate 1..7 (lun..dom), per allineamento con WEEKDAY(x,2) di Excel */
export type MonteOreSettimana = Record<1 | 2 | 3 | 4 | 5 | 6 | 7, number>

export interface Timbratura {
  id: string
  dipendenteId: number
  data: string // YYYY-MM-DD
  servizioId: number
  tipoVoce: TipoVoce
  oraInizio: string | null // HH:mm
  oraFine: string | null // HH:mm
  ore: number
  notte: boolean
  mutua: boolean
  note: string | null
  creataDa: string | null
  modificataDa: string | null
  modificataIl: string | null
  /** Riga scritta da qualcun altro (responsabile o HR) per conto del dipendente. */
  perConto: boolean
  // arricchimenti (join con servizio)
  servizioNome?: string
  centroCosto?: number
}

export interface TimbraturaInput {
  data: string
  servizioId: number
  /** Ingresso e uscita (HH:mm). OBBLIGATORI per le voci di lavoro: le ore sono
   *  sempre calcolate da questi due valori, al minuto esatto. Devono restare
   *  vuoti per i giustificativi, che occupano il monte ore atteso del giorno. */
  oraInizio?: string | null
  oraFine?: string | null
  mutua?: boolean
  note?: string | null
}

export interface ChiusuraMese {
  id: number
  dipendenteId: number
  anno: number
  mese: number
  stato: StatoMese
  chiusoDa: string | null
  chiusoIl: string | null
  /** Foglio ore in formato Excel nella cartella personale. */
  fileUrl: string | null
  /** Foglio ore in PDF: e' la copia che il dipendente riceve e conferma. */
  filePdfUrl: string | null
  validatoDa: string | null
  validatoIl: string | null
  confermatoDa: string | null
  confermatoIl: string | null
  /** Conferma messa dal responsabile al posto del dipendente che non risponde. */
  confermatoForzato: boolean
  contestatoIl: string | null
  noteContestazione: string | null
  /** Token del link nella mail di conferma (non esposto al client). */
  token?: string | null
  ultimoSollecito: string | null
}

/**
 * Cosa puo' fare il dipendente su un mese, e perche'.
 * Le ore di lavoro si inseriscono solo negli ultimi giorni; i giustificativi
 * (ferie, permessi, malattia) seguono il solo stato del mese, cosi' si possono
 * programmare in anticipo e registrare quando il certificato arriva.
 */
export interface FinestraMese {
  stato: StatoMese
  /** Il mese accetta ancora scritture dal dipendente. */
  aperta: boolean
  motivo?: string
  /** Prima data per cui si possono ancora inserire ORE DI LAVORO. */
  daGiorno: string
  /** Ultimo giorno in cui il mese resta aperto al dipendente. */
  ultimoGiorno: string
}

/** Riga del cruscotto giornaliero: totali del giorno vs monte ore atteso */
export interface RiepilogoGiorno {
  data: string
  oreLavorate: number // solo tipo_voce = lavoro
  oreGiustificativo: number
  oreAttese: number // 0 se festivo
  festivo: boolean
  festivitaNome?: string
  completo: boolean // oreLavorate+oreGiustificativo >= oreAttese
}

/** Riga di scostamento su una singola settimana (ISO lun–dom, ritagliata al periodo) */
export interface RiepilogoSettimana {
  inizio: string // YYYY-MM-DD (primo giorno della settimana compreso nel periodo)
  fine: string // YYYY-MM-DD (ultimo giorno della settimana compreso nel periodo)
  oreLavorate: number
  oreGiustificativo: number
  oreAttese: number
  scostamento: number // (lavorate+giustificativo) - attese
  conclusa: boolean // true se la settimana è terminata (fine < oggi): scostamento definitivo
}

/**
 * Ore consumate su una singola voce di giustificativo nel periodo.
 * Serve a mostrare Ferie / Flessibilità / Permessi ecc. spaccati, non solo il
 * totale: è il dato che interessa a chi compila e a chi controlla.
 */
export interface OrePerVoce {
  servizioId: number
  nome: string
  ore: number
}

/** Cruscotto settimanale/mensile dell'operatore */
export interface RiepilogoPeriodo {
  oreLavorate: number
  oreGiustificativo: number
  oreAttese: number
  scostamento: number // (lavorate+giustificativo) - attese
  giorni: RiepilogoGiorno[]
  settimane: RiepilogoSettimana[]
  /** Spaccato dei giustificativi usati nel periodo (solo voci con ore > 0). */
  giustificativi: OrePerVoce[]
}

/** Riga del cruscotto HR: stato del mese per dipendente */
export interface StatoDipendenteMese {
  dipendenteId: number
  cognomeNome: string
  email: string
  oreLavorate: number
  oreAttese: number
  scostamento: number
  giorniIncompleti: number
  stato: StatoMese
  fileUrl: string | null
  filePdfUrl: string | null
  settimane: RiepilogoSettimana[]
  /** Responsabile che deve validare il foglio; null = nessuno assegnato. */
  referenteEmail: string | null
  validatoDa: string | null
  validatoIl: string | null
  confermatoIl: string | null
  confermatoForzato: boolean
  noteContestazione: string | null
  /** Giorni trascorsi dall'invio al dipendente senza risposta (stato validato). */
  giorniInAttesa: number | null
  /**
   * Persona non più abilitata (rapporto chiuso o spunta togliata) che compare
   * comunque perché ha righe o una chiusura in questo mese: le HR devono poter
   * chiudere l'ultimo mese e generare il foglio ore finale.
   */
  disattivato?: boolean
}
