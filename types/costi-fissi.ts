/**
 * Costi fissi delle strutture: affitto, assicurazione, IMU, TARI, telefonia…
 * Lista SharePoint "Costi Ricorrenti Strutture" (c'era già, vuota, il 09/10/2026).
 * Per ora si inseriscono a mano; quali automatizzare si decide dopo (Dennis).
 */

/** Valori della Choice `Categoria` su SharePoint, nell'ordine della lista. */
export const CATEGORIE_FISSE = [
  'Energia elettrica',
  'Gas',
  'Acqua',
  'TARI',
  'IMU',
  'Assicurazione',
  'Canone locazione',
  'Pulizie',
  'Telefonia/Internet',
  'Altro',
] as const
export type CategoriaFissa = (typeof CATEGORIE_FISSE)[number]

/**
 * Le categorie proposte nel modulo dell'app. Luce, gas e acqua restano fuori:
 * arrivano dalle bollette XML, e un costo fisso in più le conterebbe due
 * volte. Se qualcuno le inserisce da SharePoint, il cruscotto le mostra con
 * un avviso.
 */
export const CATEGORIE_MODULO: readonly CategoriaFissa[] = CATEGORIE_FISSE.filter(
  (c) => !['Energia elettrica', 'Gas', 'Acqua'].includes(c),
)

export const FREQUENZE = ['Mensile', 'Bimestrale', 'Trimestrale', 'Semestrale', 'Annuale'] as const
export type Frequenza = (typeof FREQUENZE)[number]

export const MESI_FREQUENZA: Record<Frequenza, number> = {
  Mensile: 1,
  Bimestrale: 2,
  Trimestrale: 3,
  Semestrale: 6,
  Annuale: 12,
}

export interface CostoFisso {
  id: number
  descrizione: string
  strutturaId: number | null
  strutturaNome: string
  categoria: string
  importo: number          // per ogni scadenza
  frequenza: Frequenza
  /** Da quando vale (colonna "Data prima scadenza"); null = da sempre. */
  dataPrimaScadenza: string | null
  /** Ultimo giorno in cui vale; null = vale ancora. */
  dataFine: string | null
  /** Colonna SP `Attivo`. Spenta senza `dataFine` = vecchio modo di chiudere: non si sa da quando, non si conta. */
  attivo: boolean
  fornitore: string
  note: string
}

/**
 * Come cambia un costo fisso senza toccare il passato (Dennis, 09/10/2026):
 *   - VARIAZIONE (es. l'affitto aumenta da marzo): la voce vecchia si chiude
 *     alla fine del mese prima, ne nasce una nuova da quel mese;
 *   - FINE (il costo viene a mancare): la voce si chiude all'ultimo giorno indicato;
 *   - CORREZIONE di un errore di battitura: si riscrive la voce, passato compreso.
 */
export type ModoModifica = 'variazione' | 'correzione'

/** 2026-03-15 → 2026-02-28: la voce vecchia vale fino alla fine del mese prima. */
export function fineMesePrecedente(iso: string): string {
  const [a, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10)
}

/** Primo giorno del mese di una data. */
export const inizioMese = (iso: string) => `${iso.slice(0, 7)}-01`

/** In vigore oggi: non chiusa (o chiusa nel futuro) e non spenta alla vecchia maniera. */
export function inVigore(c: Pick<CostoFisso, 'dataFine' | 'attivo' | 'dataPrimaScadenza'>, oggi: string): boolean {
  if (c.dataFine) return c.dataFine >= oggi
  return c.attivo
}

export interface DatiCostoFisso {
  descrizione: string
  strutturaId: number
  categoria: CategoriaFissa
  importo: number
  frequenza: Frequenza
  dataPrimaScadenza: string | null
  fornitore: string
  note: string
}

/** Costo annuo equivalente: importo × scadenze in un anno. */
export const annuo = (c: Pick<CostoFisso, 'importo' | 'frequenza'>) =>
  Math.round(c.importo * (12 / (MESI_FREQUENZA[c.frequenza] ?? 12)) * 100) / 100

export function leggiDatiCostoFisso(b: Record<string, unknown>): { dati: DatiCostoFisso } | { problemi: string[] } {
  const problemi: string[] = []
  const descrizione = String(b.descrizione ?? '').trim()
  const strutturaId = Number(b.strutturaId ?? 0)
  const categoria = String(b.categoria ?? '') as CategoriaFissa
  const importo = Number(String(b.importo ?? '').replace(',', '.'))
  const frequenza = String(b.frequenza ?? '') as Frequenza
  const data = String(b.dataPrimaScadenza ?? '').trim()
  if (!descrizione) problemi.push('Scrivi una descrizione')
  if (!strutturaId) problemi.push('Scegli la struttura')
  if (!CATEGORIE_FISSE.includes(categoria)) problemi.push('Scegli la categoria')
  if (!Number.isFinite(importo) || importo <= 0) problemi.push("L'importo deve essere maggiore di zero")
  if (!FREQUENZE.includes(frequenza)) problemi.push('Scegli la frequenza')
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) problemi.push('Data non valida')
  if (problemi.length) return { problemi }
  return {
    dati: {
      descrizione,
      strutturaId,
      categoria,
      importo: Math.round(importo * 100) / 100,
      frequenza,
      dataPrimaScadenza: data || null,
      fornitore: String(b.fornitore ?? '').trim(),
      note: String(b.note ?? '').trim(),
    },
  }
}

export const dataValida = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
