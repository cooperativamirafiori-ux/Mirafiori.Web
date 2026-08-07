/**
 * Genera, per UN dipendente/collaboratore, la "Scheda Progressiva" — lo stesso
 * modulo cartaceo del libro soci — già precompilata con i dati dell'anagrafica
 * RU, partendo dal modello .xlsx originale (stessa impaginazione, stessi
 * merge di cella, stessi stili: si tocca solo il valore delle celle).
 *
 * Modello: lib/templates/scheda-socio/Scheda_Progressiva_TEMPLATE.xlsx
 * (incluso nel bundle Vercel tramite outputFileTracingIncludes in next.config.mjs)
 *
 * Corrispondenza campo modulo -> campo RU (decisa con Dennis il 2026-08-07):
 *   N. Elenco Generale     -> NumeroElencoGenerale (nuovo campo)
 *   Tipo di socio          -> TipoRapporto (nessun campo nuovo: si riusa questo)
 *   Cognome / Nome         -> Cognome / Nome
 *   Data / luogo di nascita -> DataNascita / LuogoNascita
 *   Città / indirizzo di residenza -> ComuneResidenza / IndirizzoResidenza
 *     (dall'08-08-2026: ComuneResidenza sostituisce il precedente CittaResidenza,
 *     nell'ambito dello split di Residenza/Domicilio in Indirizzo+CAP+Comune)
 *   Cittadinanza           -> Nazionalita
 *   Codice Fiscale         -> CodiceFiscale
 *   Professione            -> Mansione
 *   Data ammissione/dimissione socio -> DataAmmissioneSocio / DataDimissioneSocio
 *   CAPITALE SOTTOSCRITTO/VERSATO -> non compilato per ora (deciso con Dennis:
 *     "lascia perdere un attimo la parte di capitale"). Le celle restano vuote,
 *     pronte per essere riprese in un secondo momento.
 */

import { join } from 'node:path'
import ExcelJS from 'exceljs'
import type { RURecord } from '@/types/risorse-umane'

const TEMPLATE_PATH = join(
  process.cwd(),
  'lib',
  'templates',
  'scheda-socio',
  'Scheda_Progressiva_TEMPLATE.xlsx',
)

const FMT_DATA = 'dd/mm/yyyy'

function testo(v: RURecord[string]): string {
  return v == null ? '' : String(v).trim()
}

/** Converte "YYYY-MM-DD" in Date (mezzogiorno UTC, come nel resto dell'export RU). */
function toDate(v: RURecord[string]): Date | null {
  if (v == null || v === '') return null
  const s = String(v).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function numero(v: RURecord[string]): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Scrive un valore data in una cella, forzando il formato italiano dd/mm/yyyy. */
function setData(ws: ExcelJS.Worksheet, indirizzo: string, v: RURecord[string]) {
  const cell = ws.getCell(indirizzo)
  cell.value = toDate(v)
  cell.numFmt = FMT_DATA
}

function setTesto(ws: ExcelJS.Worksheet, indirizzo: string, v: RURecord[string]) {
  ws.getCell(indirizzo).value = testo(v)
}

/** Costruisce il buffer .xlsx della scheda progressiva per il record indicato. */
export async function generaSchedaSocioBuffer(record: RURecord): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(TEMPLATE_PATH)
  const ws = wb.worksheets[0]

  const numElenco = numero(record.NumeroElencoGenerale)
  if (numElenco != null) ws.getCell('F1').value = numElenco

  setTesto(ws, 'F4', record.TipoRapporto)

  setTesto(ws, 'A8', record.Cognome)
  setTesto(ws, 'F8', record.Nome)

  setData(ws, 'A12', record.DataNascita)
  setTesto(ws, 'F12', record.LuogoNascita)

  setTesto(ws, 'A16', record.ComuneResidenza)
  setTesto(ws, 'F16', record.IndirizzoResidenza)

  setTesto(ws, 'A20', record.Nazionalita)
  setTesto(ws, 'A24', record.CodiceFiscale)
  setTesto(ws, 'A28', record.Mansione)

  setData(ws, 'A32', record.DataAmmissioneSocio)
  setData(ws, 'F32', record.DataDimissioneSocio)

  const ab = await wb.xlsx.writeBuffer()
  return Buffer.from(ab)
}

/** Nome file suggerito, es. "Scheda_Progressiva_Biscardi_Loredana.xlsx". */
export function nomeFileSchedaSocio(record: RURecord): string {
  const sanitize = (s: string) =>
    s
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60)
  const cognome = sanitize(testo(record.Cognome)) || 'Cognome'
  const nome = sanitize(testo(record.Nome)) || 'Nome'
  return `Scheda_Progressiva_${cognome}_${nome}.xlsx`
}
