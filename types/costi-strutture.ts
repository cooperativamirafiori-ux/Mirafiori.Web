/**
 * Cruscotto unico "Costi per struttura" (Amministrazione): per ogni struttura
 * i parziali — utenze, manutenzioni, pulizie, acquisti, lavori Cura Ambienti,
 * costi fissi, telefonia, altro — e il totale. Decisioni: docs/utenze.md
 */

import type { TipoUtenza } from './utenze'

export type Parziale =
  | 'utenze'
  | 'manutenzioni'
  | 'pulizie'
  | 'cura_ambienti'
  | 'acquisti'
  | 'costi_fissi'
  | 'telefonia'
  | 'altro'

/** Ordine di presentazione, etichette, colori (8 tinte distinte anche per chi non vede i colori). */
export const PARZIALI: Array<{ chiave: Parziale; etichetta: string; colore: string; fonte: string }> = [
  { chiave: 'utenze', etichetta: 'Utenze', colore: '#2a78d4', fonte: 'bollette di luce, gas e acqua dagli XML' },
  { chiave: 'manutenzioni', etichetta: 'Manutenzioni', colore: '#e0882b', fonte: 'Costi Strutture: chiusura dei ticket e costi diretti' },
  { chiave: 'pulizie', etichetta: 'Pulizie', colore: '#14a38b', fonte: 'Costi Strutture, categoria pulizie' },
  { chiave: 'cura_ambienti', etichetta: 'Lavori Cura Ambienti', colore: '#7a5bd6', fonte: 'consuntivi interni di cc24 (ore × tariffa + materiali)' },
  { chiave: 'acquisti', etichetta: 'Acquisti', colore: '#c2457a', fonte: 'Richieste acquisto consegnate' },
  { chiave: 'costi_fissi', etichetta: 'Costi fissi', colore: '#5c6b7a', fonte: 'affitto, assicurazione, IMU, TARI… dai Costi fissi, spalmati sui mesi' },
  { chiave: 'telefonia', etichetta: 'Telefonia/Internet', colore: '#9a8a1e', fonte: 'dai Costi fissi' },
  { chiave: 'altro', etichetta: 'Altro', colore: '#a3a3a3', fonte: 'Costi Strutture, altre categorie' },
]

export type PerParziale = Record<Parziale, number>

export interface Movimento {
  data: string          // ISO, per ordinare
  parziale: Parziale
  sotto: string | null  // "Luce", "Canone locazione"…
  descrizione: string
  importo: number
  link: string | null   // PDF della bolletta, quando c'è
}

export interface UtenzaAnno {
  tipo: TipoUtenza
  unita: string
  importo: number
  consumo: number
  /** € per unità, solo sulle bollette con il consumo (null se nessuna). */
  costoUnitario: number | null
  mesiImporto: number[]  // 12
  mesiConsumo: number[]  // 12
}

export interface SchedaStruttura {
  id: number
  codice: string
  nome: string
  ccCodice: string | null
  ccNome: string | null
  totale: number
  parziali: PerParziale
  mesi: number[]                    // totale per mese (12)
  mesiPerParziale: Record<Parziale, number[]>
  utenze: UtenzaAnno[]
  movimenti: Movimento[]
  avvisi: string[]
}

export interface CruscottoStrutture {
  anno: number
  /** Ultimo mese contato (0-11): per l'anno in corso è il mese di oggi. */
  meseLimite: number
  totale: number
  parziali: PerParziale
  mesi: number[]
  strutture: SchedaStruttura[]
  /** Costi della lista Costi Strutture senza struttura (stanno solo su un centro di costo). */
  senzaStruttura: { righe: number; importo: number }
  /** Bollette arrivate con un codice che la Mappatura non conosce. */
  daCollegare: { codici: number; importo: number }
  avvisi: string[]
}

export const vuotoPerParziale = (): PerParziale => ({
  utenze: 0, manutenzioni: 0, pulizie: 0, cura_ambienti: 0, acquisti: 0, costi_fissi: 0, telefonia: 0, altro: 0,
})
