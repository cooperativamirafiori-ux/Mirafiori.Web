/**
 * Esportazione in Excel (.xlsx) dei record dell'area Risorse Umane
 * (Dipendenti — che include anche i Collaboratori, distinti dal campo
 * CategoriaRU — / Tirocini) con SCELTA DELLE COLONNE.
 *
 * L'export è guidato dallo schema in types/risorse-umane.ts (RU_CONFIG):
 * l'intestazione di ogni colonna è la `label` del campo e il valore viene
 * formattato in base al `type` (date come vere date Excel, currency con
 * formato €, choice/testo come stringa). Aggiungere un campo allo schema lo
 * rende automaticamente esportabile, senza modifiche qui.
 *
 * Usa ExcelJS, già dipendenza del progetto (vedi lib/foglio-ore-xlsx.ts).
 */

import ExcelJS from 'exceljs'
import { RU_CONFIG, type RUEntity, type RUField, type RURecord } from '@/types/risorse-umane'

const HEAD_FILL = '1F4E79'
const FMT_DATA = 'dd/mm/yyyy'
const FMT_EURO = '#,##0.00 "€"'

/** Converte "YYYY-MM-DD" in Date (mezzogiorno UTC per evitare scavallamenti di fuso). */
function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null
  const s = String(v).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Filtra e ordina i campi dello schema secondo le `key` richieste,
 * mantenendo l'ordine indicato dal chiamante. Ignora le key sconosciute.
 */
function risolviCampi(entity: RUEntity, keys: string[]): RUField[] {
  const perKey = new Map(RU_CONFIG[entity].fields.map((f) => [f.key, f]))
  const out: RUField[] = []
  for (const k of keys) {
    const f = perKey.get(k)
    if (f) out.push(f)
  }
  return out
}

/** Larghezza colonna euristica in base al tipo/label. */
function larghezza(field: RUField): number {
  if (field.type === 'date') return 14
  if (field.type === 'currency' || field.type === 'number') return 16
  if (field.type === 'textarea') return 40
  return Math.min(Math.max(field.label.length + 4, 14), 34)
}

export interface ExportOptions {
  /** Chiavi delle colonne da esportare, nell'ordine desiderato. */
  fields: string[]
  /** Record già filtrati/ordinati dal chiamante. */
  records: RURecord[]
}

/** Costruisce il buffer .xlsx per l'entità con le colonne selezionate. */
export async function generaExportBuffer(
  entity: RUEntity,
  { fields, records }: ExportOptions,
): Promise<Buffer> {
  const config = RU_CONFIG[entity]
  const campi = risolviCampi(entity, fields)
  // Fallback: se nessuna colonna valida, esporta almeno Cognome e Nome.
  const colonne = campi.length ? campi : risolviCampi(entity, ['Cognome', 'Nome'])

  const wb = new ExcelJS.Workbook()
  wb.creator = 'App Mirafiori'
  wb.created = new Date()
  const ws = wb.addWorksheet(config.label)

  // Intestazioni
  ws.columns = colonne.map((f) => ({
    header: f.label,
    key: f.key,
    width: larghezza(f),
  }))

  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.height = 20
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEAD_FILL}` } }
  })

  // Righe dati
  for (const rec of records) {
    const row: Record<string, unknown> = {}
    for (const f of colonne) {
      const raw = rec[f.key]
      if (f.type === 'date') row[f.key] = toDate(raw)
      else if (f.type === 'currency' || f.type === 'number') row[f.key] = toNumber(raw)
      else row[f.key] = raw == null ? '' : String(raw)
    }
    ws.addRow(row)
  }

  // Formati numerici per colonna (date/valuta)
  colonne.forEach((f, i) => {
    const col = ws.getColumn(i + 1)
    if (f.type === 'date') col.numFmt = FMT_DATA
    else if (f.type === 'currency') col.numFmt = FMT_EURO
  })

  // Blocca la riga di intestazione e attiva l'autofiltro
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colonne.length } }

  const ab = await wb.xlsx.writeBuffer()
  return Buffer.from(ab)
}

/** Nome file suggerito, es. "Dipendenti_2026-07-09.xlsx". */
export function nomeFileExport(entity: RUEntity): string {
  const oggi = new Date().toISOString().slice(0, 10)
  return `${RU_CONFIG[entity].label}_${oggi}.xlsx`
}
