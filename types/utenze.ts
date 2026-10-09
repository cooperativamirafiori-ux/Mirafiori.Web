/**
 * Utenze: luce, gas, acqua delle strutture, e le bollette che arrivano dagli XML.
 * Decisioni: docs/utenze.md
 */

/** Permesso che apre la sezione (le schermate stanno in Amministrazione). */
export const AREA_AMMINISTRAZIONE = 'Amministrazione'

export type TipoUtenza = 'luce' | 'gas' | 'acqua' | 'altro'

/** Valori della colonna Choice `TipoFornitura` su SharePoint. */
export const TIPO_SP: Record<Exclude<TipoUtenza, 'altro'>, string> = {
  luce: 'Energia elettrica',
  gas: 'Gas',
  acqua: 'Acqua',
}

export const ETICHETTA_TIPO: Record<TipoUtenza, string> = {
  luce: 'Luce',
  gas: 'Gas',
  acqua: 'Acqua',
  altro: 'Altro',
}

export const UNITA_TIPO: Record<TipoUtenza, string> = {
  luce: 'kWh',
  gas: 'Smc',
  acqua: 'm³',
  altro: '',
}

export function tipoDaSp(v: string | null | undefined): TipoUtenza {
  const s = (v ?? '').toLowerCase()
  if (s.startsWith('energia') || s === 'luce') return 'luce'
  if (s.startsWith('gas')) return 'gas'
  if (s.startsWith('acqua')) return 'acqua'
  return 'altro'
}

/** Codice come lo si confronta: maiuscolo, senza spazi né separatori. */
export const normCodice = (c: string | null | undefined) => (c ?? '').toUpperCase().replace(/[\s.\-_/]/g, '')

/** Codici veri: POD, PDR (14 cifre), contratto/utenza numerico lungo. Il resto è un segnaposto. */
export function codiceValido(c: string): boolean {
  const n = normCodice(c)
  return /^IT\d{3}E\d{8}[A-Z0-9]?$/.test(n) || /^\d{8,20}$/.test(n)
}

/** Una fornitura letta da una fattura XML: un codice, i suoi importi, consumi e periodo. */
export interface FornituraSdi {
  codice: string            // normalizzato
  tipo: TipoUtenza
  importo: number           // imponibile della parte di fattura di questo codice
  consumo: number | null
  unita: string | null      // kWh, Smc, m³
  periodoDal: string | null // ISO
  periodoAl: string | null
}

/** Riga della lista SharePoint "Mappatura Utenze". */
export interface RigaMappatura {
  id: number
  codice: string
  tipo: TipoUtenza
  strutturaId: number | null
  percentuale: number
  fornitore: string
  note: string
  segnaposto: boolean
}

export interface DatiMappatura {
  codice: string
  tipo: Exclude<TipoUtenza, 'altro'>
  strutturaId: number
  percentuale: number
  fornitore: string
  note: string
}

/** Struttura come serve a utenze e cruscotto. */
export interface StrutturaCc {
  id: number
  codice: string
  nome: string
  ccCodice: string | null   // minuscolo: cc9
  ccNome: string | null
}

/** Una bolletta registrata (fattura × codice), con le sue quote per struttura. */
export interface Bolletta {
  id: string
  fatturaId: string
  fornitore: string
  numero: string
  dataFattura: string
  codice: string
  tipo: TipoUtenza
  importo: number
  consumo: number | null
  unita: string | null
  periodoDal: string | null
  periodoAl: string | null
  pdfUrl: string | null
  quote: Array<{ strutturaId: number; strutturaNome: string; ccCodice: string | null; percentuale: number }>
}

/** Un codice arrivato in fattura che la Mappatura non conosce. */
export interface DaCollegare {
  codice: string
  tipo: TipoUtenza
  fornitore: string
  bollette: number
  importo: number
  ultima: string
}

/** Riepilogo per utenza nella schermata Utenze. */
export interface UtenzaConUltima extends RigaMappatura {
  bolletteAnno: number
  ultima: { data: string; importo: number; consumo: number | null; unita: string | null; periodoDal: string | null; periodoAl: string | null } | null
}

export function leggiDatiMappatura(b: Record<string, unknown>): { dati: DatiMappatura } | { problemi: string[] } {
  const problemi: string[] = []
  const codice = String(b.codice ?? '').trim().toUpperCase()
  const tipo = String(b.tipo ?? '') as DatiMappatura['tipo']
  const strutturaId = Number(b.strutturaId ?? 0)
  const percentuale = Number(String(b.percentuale ?? '100').replace(',', '.'))
  if (!codice) problemi.push('Scrivi il codice (POD, PDR o numero utenza)')
  if (!['luce', 'gas', 'acqua'].includes(tipo)) problemi.push('Scegli il tipo di fornitura')
  if (!strutturaId) problemi.push('Scegli la struttura')
  if (!Number.isFinite(percentuale) || percentuale <= 0 || percentuale > 100) problemi.push('La percentuale va da 1 a 100')
  if (problemi.length) return { problemi }
  return {
    dati: {
      codice,
      tipo,
      strutturaId,
      percentuale: Math.round(percentuale * 100) / 100,
      fornitore: String(b.fornitore ?? '').trim(),
      note: String(b.note ?? '').trim(),
    },
  }
}
