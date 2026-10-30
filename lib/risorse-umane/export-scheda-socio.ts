/**
 * Genera, per UN dipendente/collaboratore, la "Scheda Progressiva" — lo stesso
 * modulo cartaceo del libro soci — già precompilata con i dati dell'anagrafica
 * RU, partendo dal modello .xlsx originale (stessa impaginazione, stessi
 * merge di cella, stessi stili: si tocca solo il valore delle celle).
 *
 * Modello: lib/templates/scheda-socio/Scheda_Progressiva_TEMPLATE.xlsx
 * (incluso nel bundle Vercel tramite outputFileTracingIncludes in next.config.mjs)
 *
 * Dal 30/10/2026 il modello è il foglio "Nuovo" di BERTOGLIO_231.xlsx salvato
 * da Excel, svuotato dei dati, e il file NON passa più da ExcelJS: si apre lo
 * zip e si sostituisce solo il contenuto delle celle dati nell'XML del foglio.
 * Il giro ExcelJS (leggi + riscrivi) produceva un file che Excel apriva solo
 * "recuperando il contenuto" e perdendo unioni di cella e area di stampa.
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
 *   CAPITALE SOTTOSCRITTO/VERSATO -> non compilato dal bottone "Scheda socio"
 *     della scheda RU (deciso con Dennis: "lascia perdere un attimo la parte di
 *     capitale").
 *
 * Dal 29/10/2026 la usa anche la domanda di ammissione socio (lib/soci/), che
 * passa `extra`: il tipo di socio scelto nella domanda — che non sempre
 * coincide con il Tipo di rapporto della scheda RU — la professione dichiarata
 * e la prima riga del capitale sottoscritto (data della domanda e importo).
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import PizZip from 'pizzip'
import type { RURecord } from '@/types/risorse-umane'

const TEMPLATE_PATH = join(
  process.cwd(),
  'lib',
  'templates',
  'scheda-socio',
  'Scheda_Progressiva_TEMPLATE.xlsx',
)

const FOGLIO = 'xl/worksheets/sheet1.xml'

function testo(v: RURecord[string]): string {
  return v == null ? '' : String(v).trim()
}

/** Converte "YYYY-MM-DD" in numero seriale Excel (giorni dal 30/12/1899). */
function serialeExcel(v: RURecord[string]): number | null {
  if (v == null || v === '') return null
  const s = String(v).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const ms = Date.parse(`${s}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return Math.round((ms - Date.UTC(1899, 11, 30)) / 86_400_000)
}

function numero(v: RURecord[string]): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // caratteri di controllo non ammessi in XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

/**
 * Sostituisce il contenuto di una cella del modello lasciandone lo stile (s="..").
 * La cella deve esistere nel modello: se manca è un errore del modello, non dei dati.
 */
function scriviCella(xml: string, ref: string, valore: string | number | null): string {
  const re = new RegExp(`<c r="${ref}" s="(\\d+)"(?: t="\\w+")?(?:/>|>.*?</c>)`)
  const m = xml.match(re)
  if (!m) throw new Error(`Modello scheda socio: cella ${ref} non trovata`)
  const s = m[1]
  let nuova: string
  if (valore == null || valore === '') nuova = `<c r="${ref}" s="${s}"/>`
  else if (typeof valore === 'number') nuova = `<c r="${ref}" s="${s}"><v>${valore}</v></c>`
  else nuova = `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(valore)}</t></is></c>`
  return xml.replace(re, nuova)
}

export interface ExtraSchedaSocio {
  /** Sostituisce il Tipo di rapporto della scheda RU (cella F4). */
  tipoSocio?: string
  /** Sostituisce la Mansione (cella A28). */
  professione?: string
  /** Prima riga di CAPITALE SOTTOSCRITTO (A36 data, B36 importo). */
  capitaleSottoscritto?: { data: string; importo: number }
}

/** Costruisce il buffer .xlsx della scheda progressiva per il record indicato. */
export async function generaSchedaSocioBuffer(record: RURecord, extra: ExtraSchedaSocio = {}): Promise<Buffer> {
  const zip = new PizZip(await readFile(TEMPLATE_PATH))
  const file = zip.file(FOGLIO)
  if (!file) throw new Error('Modello scheda socio: foglio non trovato')
  let xml = file.asText()

  // Le date usano gli stili data del modello (gg/mm/aaaa), l'importo lo stile in euro.
  const celle: [string, string | number | null][] = [
    ['F1', numero(record.NumeroElencoGenerale)],
    ['F4', testo(extra.tipoSocio ?? record.TipoRapporto)],
    ['A8', testo(record.Cognome)],
    ['F8', testo(record.Nome)],
    ['A12', serialeExcel(record.DataNascita)],
    ['F12', testo(record.LuogoNascita)],
    ['A16', testo(record.ComuneResidenza)],
    ['F16', testo(record.IndirizzoResidenza)],
    ['A20', testo(record.Nazionalita)],
    ['A24', testo(record.CodiceFiscale)],
    ['A28', testo(extra.professione ?? record.Mansione)],
    ['A32', serialeExcel(record.DataAmmissioneSocio)],
    ['F32', serialeExcel(record.DataDimissioneSocio)],
  ]
  if (extra.capitaleSottoscritto) {
    celle.push(['A36', serialeExcel(extra.capitaleSottoscritto.data)])
    celle.push(['B36', extra.capitaleSottoscritto.importo])
  }
  for (const [ref, v] of celle) xml = scriviCella(xml, ref, v)

  zip.file(FOGLIO, xml)
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
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
