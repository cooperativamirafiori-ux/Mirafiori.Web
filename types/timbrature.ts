/**
 * Tipi della sezione Timbrature (dati su Supabase/Postgres).
 * Vedi web/supabase/timbrature_schema.sql per lo schema.
 */

export type TipoVoce = 'lavoro' | 'giustificativo'
export type StatoMese = 'aperto' | 'chiuso'

export interface Servizio {
  id: number
  nome: string
  centroCosto: number // 1-5 = lavoro, 99 = giustificativi
  categoria: string | null
  tipoVoce: TipoVoce
  attivo: boolean
  ordine: number
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
  // arricchimenti (join con servizio)
  servizioNome?: string
  centroCosto?: number
}

export interface TimbraturaInput {
  data: string
  servizioId: number
  /** Ore inserite direttamente (voci di lavoro). Se presente, ha priorità sul
   *  calcolo da oraInizio/oraFine. Supporta le mezze ore (step 0.5). */
  ore?: number | null
  oraInizio?: string | null
  oraFine?: string | null
  notte?: boolean
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
  fileUrl: string | null
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

/** Cruscotto settimanale/mensile dell'operatore */
export interface RiepilogoPeriodo {
  oreLavorate: number
  oreGiustificativo: number
  oreAttese: number
  scostamento: number // (lavorate+giustificativo) - attese
  giorni: RiepilogoGiorno[]
  settimane: RiepilogoSettimana[]
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
  settimane: RiepilogoSettimana[]
}
