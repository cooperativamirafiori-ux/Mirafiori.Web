#!/usr/bin/env node
/**
 * Import dati soci dal foglio "Quote Sociali 2026" (file
 * "Elenco GENERALE Soci e Dipendenti.xlsx") nelle liste SharePoint dell'area
 * Risorse Umane. Gestisce sia i DIPENDENTI sia i COLLABORATORI.
 *
 * REGOLA RICHIESTA: il FILE VINCE SEMPRE. Per ogni campo mappato il valore del
 * foglio sovrascrive quello esistente, sia quando è pieno sia quando è vuoto
 * (in quest'ultimo caso il campo viene azzerato/null).
 *
 * DUE PROTEZIONI (aggiunte dopo la prima esecuzione):
 *   1) DATE IMPLAUSIBILI: se una cella data contiene un valore presente ma
 *      assurdo (anno < 1900 o > anno prossimo — es. il refuso "1007"), il campo
 *      NON viene toccato (per non sovrascrivere una data valida con spazzatura)
 *      e viene segnalato a fine esecuzione.
 *   2) CF su MATCH-PER-NOME: se l'abbinamento avviene per nome (non per CF) e il
 *      CF del file è diverso da quello in lista, il CodiceFiscale NON viene
 *      sovrascritto (evita di rimpiazzare un CF valido con uno errato) e viene
 *      segnalato. Il match resta comunque valido per tutti gli altri campi.
 *
 * MATCH: per Codice Fiscale normalizzato; se non trovato, fallback su
 * "Cognome Nome" normalizzato purché la corrispondenza sia UNICA.
 *
 * CAMPI MAPPATI — DIPENDENTI (colonna Excel -> campo DB):
 *   Data di nascita              -> DataNascita          (data)
 *   Genere (M/F)                 -> Genere               (Maschio/Femmina)
 *   Codice Fiscale               -> CodiceFiscale        (normalizzato)
 *   UE ExtraUE                   -> AreaGeografica       (Comunitario/Extracomunitario)
 *   Sez. Coop. (A/B)             -> AreaAssunzione       (Tipo A/Tipo B)
 *   Categoria                    -> TipoRapporto         (Socio lavoratore/Socio volontario)
 *   Data Ammissione              -> DataAmmissioneSocio  (data)
 *   Data Dimissioni              -> DataDimissioneSocio  (data)
 *   Totale Capitale sottoscritto -> QuotaSociale         (numero)
 *   Totale Capitale versato      -> QuotaSocialeVersata  (numero)
 *   Note                         -> Note                 (testo)
 *
 * CAMPI MAPPATI — COLLABORATORI (lo schema ha meno campi):
 *   Data di nascita              -> DataNascita     (data)
 *   Genere (M/F)                 -> Genere          (Maschio/Femmina)
 *   Codice Fiscale               -> CodiceFiscale   (normalizzato)
 *   UE ExtraUE                   -> AreaGeografica  (Comunitario/Extracomunitario)
 *   Totale Capitale sottoscritto -> CapitaleSociale (numero)
 *   Note                         -> Note            (testo)
 *   (Sez. Coop., Categoria, date socio e capitale versato NON esistono nello
 *    schema Collaboratori: vengono ignorati.)
 *
 * CAMPI VOLUTAMENTE ESCLUSI (per entrambe le entità):
 *   - email        : colonna esclusa su richiesta.
 *   - COGNOME NOME : Cognome/Nome lasciati invariati (split inaffidabile).
 *   - Tipo contratto : valori del file incompatibili con le choice del DB.
 *   - Tipo Socio (Svantaggiato), PAG., N°, mesi Gen-Dic, 13a, Differenza,
 *     conteggi quote, "Data restituzione quota sociale": nessun campo corrispondente.
 *
 * USO (dalla cartella web/):
 *   node scripts/import-quote-soci-2026.mjs [file.xlsx] [--entity=dipendenti|collaboratori] [--inserisci-nuovi] [--apply]
 *   --inserisci-nuovi: crea anche i soci del foglio assenti da ogni anagrafica
 *                      (allowlist NUOVI_DA_INSERIRE, taggati per tipo socio).
 * Esempi:
 *   node scripts/import-quote-soci-2026.mjs "~/Downloads/Elenco...xlsx"                          # dipendenti, dry-run
 *   node scripts/import-quote-soci-2026.mjs "~/Downloads/Elenco...xlsx" --apply                  # dipendenti, applica
 *   node scripts/import-quote-soci-2026.mjs "~/Downloads/Elenco...xlsx" --entity=collaboratori   # collaboratori, dry-run
 *   node scripts/import-quote-soci-2026.mjs "~/Downloads/Elenco...xlsx" --entity=collaboratori --apply
 *
 * Se il percorso non è indicato, cerca il file in web/scripts/ru-data/ e nella cwd.
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, e SP_LIST_DIPENDENTI / SP_LIST_COLLABORATORI.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, isAbsolute, resolve } from 'node:path'
import ExcelJS from 'exceljs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const INSERISCI = process.argv.includes('--inserisci-nuovi')
const SHEET = 'Quote Sociali 2026'

/**
 * Allowlist dei soci del foglio 2026 assenti da OGNI anagrafica, da CREARE con
 * --inserisci-nuovi. Sono tutti "Socio Volontario" → verranno taggati Collaboratore.
 * Limitare l'inserimento a questi nomi evita di ricreare per sbaglio record che
 * dovrebbero già esistere (es. i collaboratori uniti alla lista Dipendenti).
 */
const NUOVI_DA_INSERIRE = [
  'BISCARDI LOREDANA', 'CHEIRASCO ANTONELLA', 'MARRANO MIRCO', 'ORDINE ALESSANDRO',
]
const SKIP = Symbol('skip') // marca un campo da NON scrivere (valore presente ma non valido)

const ENTITY = (process.argv.find((a) => a.startsWith('--entity=')) || '--entity=dipendenti').split('=')[1]
if (!['dipendenti', 'collaboratori'].includes(ENTITY)) {
  throw new Error(`--entity non valido: "${ENTITY}" (usa dipendenti o collaboratori)`)
}
const LIST_ENV_KEY = ENTITY === 'collaboratori' ? 'SP_LIST_COLLABORATORI' : 'SP_LIST_DIPENDENTI'

const argPath = process.argv.slice(2).find((a) => !a.startsWith('--'))

// ------------------------------------------------------------------
// env
// ------------------------------------------------------------------
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* env già impostate */ }
}

// ------------------------------------------------------------------
// Graph
// ------------------------------------------------------------------
async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

async function graph(token, method, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${t}`)
  return t ? JSON.parse(t) : {}
}

async function getAllItems(token, site, listId, mappedFields) {
  const sel = ['Cognome', 'Nome', 'CodiceFiscale', ...mappedFields].filter((v, i, a) => a.indexOf(v) === i).join(',')
  const out = []
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=${sel})&$top=200`
  while (url) {
    const res = await graph(token, 'GET', url)
    out.push(...(res.value || []))
    const next = res['@odata.nextLink']
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

// ------------------------------------------------------------------
// Normalizzazioni / trasformazioni
// ------------------------------------------------------------------
function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Chiave nome: senza accenti/apostrofi/punteggiatura, MAIUSCOLO, token ordinati. */
function normName(s) {
  if (s == null) return ''
  const base = stripDiacritics(String(s))
    .replace(/['`´’]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .toUpperCase()
    .trim()
  return base.split(/\s+/).filter(Boolean).sort().join(' ')
}

/** Codice fiscale normalizzato: senza spazi/nbsp, MAIUSCOLO. */
function normCF(s) {
  if (s == null) return ''
  return String(s).replace(/[\s ]/g, '').toUpperCase()
}

/** Estrae il valore "grezzo" da una cella exceljs. */
function cellRaw(cell) {
  const v = cell == null ? null : cell.value
  if (v == null) return null
  if (typeof v === 'object') {
    if (v instanceof Date) return v
    if ('text' in v) return v.text
    if ('result' in v) return v.result
    if ('richText' in v) return v.richText.map((r) => r.text).join('')
  }
  return v
}

function isEmpty(v) {
  return v == null || (typeof v === 'string' && v.trim() === '') || v === '-'
}

/**
 * Data -> "YYYY-MM-DDT12:00:00Z" (giorno a mezzogiorno UTC).
 *   vuoto            -> null  (azzera: il file vince)
 *   presente ma NON valido / anno assurdo -> SKIP (non tocca il campo)
 */
function toGraphDate(v) {
  if (isEmpty(v)) return null
  let giorno
  if (v instanceof Date) {
    giorno = v.toISOString().slice(0, 10)
  } else {
    const s = String(v).trim()
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})/) || s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (!m) return SKIP
    giorno = m[0].includes('/') ? `${m[3]}-${m[2]}-${m[1]}` : m[0]
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) return SKIP
  const anno = Number(giorno.slice(0, 4))
  const annoMax = new Date().getFullYear() + 1
  if (anno < 1900 || anno > annoMax) return SKIP
  return `${giorno}T12:00:00Z`
}

function toNumber(v) {
  if (isEmpty(v)) return null
  const n = Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

function toText(v) {
  if (isEmpty(v)) return null
  return String(v).replace(/ /g, ' ').trim() || null
}

function mapGenere(v) {
  const s = String(v ?? '').trim().toUpperCase()
  if (s.startsWith('M')) return 'Maschio'
  if (s.startsWith('F')) return 'Femmina'
  return null
}

function mapAreaGeo(v) {
  const s = String(v ?? '').replace(/[\s ]/g, '').toUpperCase()
  if (s === 'UE') return 'Comunitario'
  if (s === 'EXTRAUE') return 'Extracomunitario'
  return null
}

function mapSezCoop(v) {
  const s = String(v ?? '').trim().toUpperCase()
  if (s === 'A') return 'Tipo A'
  if (s === 'B') return 'Tipo B'
  return null
}

function mapCategoria(v) {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'socio lavoratore') return 'Socio lavoratore'
  if (s === 'socio volontario') return 'Socio volontario'
  return null
}

const cfFn = (v) => normCF(v) || null

// header Excel -> { field DB, transform } per entità
const MAP_DIPENDENTI = [
  { col: 'Data di nascita',              field: 'DataNascita',         fn: toGraphDate },
  { col: 'Genere',                       field: 'Genere',              fn: mapGenere },
  { col: 'Codice Fiscale',               field: 'CodiceFiscale',       fn: cfFn },
  { col: 'UE ExtraUE',                   field: 'AreaGeografica',      fn: mapAreaGeo },
  { col: 'Sez. Coop.',                   field: 'AreaAssunzione',      fn: mapSezCoop },
  { col: 'Categoria',                    field: 'TipoRapporto',        fn: mapCategoria },
  { col: 'Data Ammissione',              field: 'DataAmmissioneSocio', fn: toGraphDate },
  { col: 'Data Dimissioni',              field: 'DataDimissioneSocio', fn: toGraphDate },
  { col: 'Totale Capitale sottoscritto', field: 'QuotaSociale',        fn: toNumber },
  { col: 'Totale Capitale versato',      field: 'QuotaSocialeVersata', fn: toNumber },
  { col: 'Note',                         field: 'Note',                fn: toText },
]

const MAP_COLLABORATORI = [
  { col: 'Data di nascita',              field: 'DataNascita',    fn: toGraphDate },
  { col: 'Genere',                       field: 'Genere',         fn: mapGenere },
  { col: 'Codice Fiscale',               field: 'CodiceFiscale',  fn: cfFn },
  { col: 'UE ExtraUE',                   field: 'AreaGeografica', fn: mapAreaGeo },
  { col: 'Totale Capitale sottoscritto', field: 'CapitaleSociale', fn: toNumber },
  { col: 'Note',                         field: 'Note',           fn: toText },
]

const MAP = ENTITY === 'collaboratori' ? MAP_COLLABORATORI : MAP_DIPENDENTI

// campi data (per il diff)
const DATE_FIELDS = new Set(MAP.filter((m) => m.fn === toGraphDate).map((m) => m.field))
const NUM_FIELDS = new Set(MAP.filter((m) => m.fn === toNumber).map((m) => m.field))

// ------------------------------------------------------------------
// Lettura Excel
// ------------------------------------------------------------------
function risolviXlsx() {
  const candidati = []
  if (argPath) candidati.push(isAbsolute(argPath) ? argPath : resolve(process.cwd(), argPath))
  candidati.push(join(__dirname, 'ru-data', 'Elenco GENERALE Soci e Dipendenti.xlsx'))
  candidati.push(resolve(process.cwd(), 'Elenco GENERALE Soci e Dipendenti.xlsx'))
  const trovato = candidati.find((p) => existsSync(p))
  if (!trovato) {
    throw new Error(
      'File Excel non trovato. Passa il percorso come primo argomento:\n' +
      '  node scripts/import-quote-soci-2026.mjs "/percorso/Elenco GENERALE Soci e Dipendenti.xlsx"',
    )
  }
  return trovato
}

async function leggiRighe(xlsxPath) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxPath)
  const ws = wb.getWorksheet(SHEET)
  if (!ws) throw new Error(`Foglio "${SHEET}" non trovato nel file.`)

  const colIndex = {}
  ws.getRow(1).eachCell((cell, col) => {
    const h = String(cellRaw(cell) ?? '').replace(/ /g, ' ').trim()
    if (h) colIndex[h] = col
  })
  const idxCognomeNome = colIndex['COGNOME NOME']
  const idxCF = colIndex['Codice Fiscale']

  const mancanti = MAP.filter((m) => !colIndex[m.col]).map((m) => m.col)
  if (mancanti.length) throw new Error(`Colonne attese non trovate nel foglio: ${mancanti.join(', ')}`)

  const righe = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const nomeFile = String(cellRaw(row.getCell(idxCognomeNome)) ?? '').replace(/ /g, ' ').trim()
    const cf = normCF(cellRaw(row.getCell(idxCF)))
    if (!nomeFile && !cf) continue

    const patch = {}
    for (const m of MAP) patch[m.field] = m.fn(cellRaw(row.getCell(colIndex[m.col])))
    righe.push({ excelRow: r, nomeFile, cf, patch })
  }
  return righe
}

// ------------------------------------------------------------------
// Match
// ------------------------------------------------------------------
function costruisciIndici(items) {
  const perCF = new Map()
  const perNome = new Map()
  for (const it of items) {
    const f = it.fields || {}
    const cf = normCF(f.CodiceFiscale)
    if (cf) { if (!perCF.has(cf)) perCF.set(cf, []); perCF.get(cf).push(it) }
    const nn = normName(`${f.Cognome ?? ''} ${f.Nome ?? ''}`)
    if (nn) { if (!perNome.has(nn)) perNome.set(nn, []); perNome.get(nn).push(it) }
  }
  return { perCF, perNome }
}

function trovaMatch(riga, idx) {
  if (riga.cf) {
    const byCF = idx.perCF.get(riga.cf)
    if (byCF && byCF.length === 1) return { item: byCF[0], via: 'CF' }
    if (byCF && byCF.length > 1) return { item: null, via: 'CF-ambiguo' }
  }
  const nn = normName(riga.nomeFile)
  if (nn) {
    const byNome = idx.perNome.get(nn)
    if (byNome && byNome.length === 1) return { item: byNome[0], via: 'nome' }
    if (byNome && byNome.length > 1) return { item: null, via: 'nome-ambiguo' }
  }
  return { item: null, via: 'non-trovato' }
}

// ------------------------------------------------------------------
// Diff (per il log): mostra solo i campi che cambiano davvero
// ------------------------------------------------------------------
function normalizzaEsistente(field, raw) {
  if (raw == null) return null
  if (DATE_FIELDS.has(field)) {
    const s = String(raw).slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00Z` : null
  }
  if (NUM_FIELDS.has(field)) {
    const n = Number(raw)
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
  }
  const s = String(raw).replace(/ /g, ' ').trim()
  return s === '' ? null : s
}

function diffCampi(patch, fieldsEsistenti) {
  const diffs = []
  for (const [field, nuovo] of Object.entries(patch)) {
    const vecchio = normalizzaEsistente(field, fieldsEsistenti[field])
    const a = vecchio == null ? '∅' : vecchio
    const b = nuovo == null ? '∅' : nuovo
    if (String(a) !== String(b)) diffs.push(`${field}: ${a} → ${b}`)
  }
  return diffs
}

// ------------------------------------------------------------------
// Creazione nuovi record (opzione --inserisci-nuovi)
// ------------------------------------------------------------------
/** Divide "COGNOME NOME": prima parola = Cognome, resto = Nome. */
function splitNome(nomeFile) {
  const toks = String(nomeFile ?? '').trim().split(/\s+/).filter(Boolean)
  if (toks.length <= 1) return { Cognome: toks[0] || '', Nome: '' }
  return { Cognome: toks[0], Nome: toks.slice(1).join(' ') }
}

/** Costruisce i campi di un NUOVO dipendente dalla riga Excel. */
function buildCreate(riga) {
  const { Cognome, Nome } = splitNome(riga.nomeFile)
  const fields = { Cognome, Nome, Title: `${Cognome} ${Nome}`.trim() || 'Senza nome' }
  for (const [k, v] of Object.entries(riga.patch)) {
    if (v === SKIP || v == null) continue
    fields[k] = v
  }
  // Socio Volontario → Collaboratore; altrimenti Dipendente.
  fields.CategoriaRU = fields.TipoRapporto === 'Socio volontario' ? 'Collaboratore' : 'Dipendente'
  return fields
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', LIST_ENV_KEY]) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const listId = process.env[LIST_ENV_KEY]

  const xlsxPath = risolviXlsx()
  console.log(`→ File Excel: ${xlsxPath}`)
  console.log(`→ Foglio: "${SHEET}"  |  Entità: ${ENTITY}`)
  console.log(`→ Modalità: ${APPLY ? 'APPLICA (scrive su SharePoint)' : 'DRY-RUN (nessuna modifica)'}`)

  const righe = await leggiRighe(xlsxPath)
  console.log(`→ Righe soci lette dal foglio: ${righe.length}`)

  const token = await getToken()
  const mappedFields = MAP.map((m) => m.field)
  const items = await getAllItems(token, site, listId, mappedFields)
  console.log(`→ Record presenti in lista "${ENTITY}": ${items.length}\n`)
  const idx = costruisciIndici(items)

  let aggiornati = 0, invariati = 0
  const nonTrovati = [], ambigui = []
  const campiRifiutati = []       // { etichetta, id, field, valore }
  const cfNonSovrascritti = []    // { etichetta, id, da, a }
  const dateScartate = []         // { etichetta, id, fields, riga }
  const usati = new Set()

  const patchUrl = (id) => `/sites/${site}/lists/${listId}/items/${id}/fields`

  async function applicaPatch(id, patch, etichetta) {
    try {
      await graph(token, 'PATCH', patchUrl(id), patch)
      return
    } catch {
      for (const [field, valore] of Object.entries(patch)) {
        try {
          await graph(token, 'PATCH', patchUrl(id), { [field]: valore })
        } catch (e) {
          const v = valore == null ? '∅' : valore
          campiRifiutati.push({ etichetta, id, field, valore: v })
          console.log(`    ⚠ campo RIFIUTATO da SharePoint: ${field} = ${v}`)
        }
      }
    }
  }

  for (const riga of righe) {
    const { item, via } = trovaMatch(riga, idx)
    if (!item) {
      if (via.includes('ambiguo')) ambigui.push({ riga, via })
      else nonTrovati.push(riga)
      continue
    }
    if (usati.has(item.id)) { ambigui.push({ riga, via: `${via} (record già usato)` }); continue }
    usati.add(item.id)

    const etichetta = riga.nomeFile || riga.cf || `riga ${riga.excelRow}`

    // Protezione 1 — date implausibili: togli i campi marcati SKIP
    const patch = {}
    const skipDate = []
    for (const [k, val] of Object.entries(riga.patch)) {
      if (val === SKIP) skipDate.push(k)
      else patch[k] = val
    }
    if (skipDate.length) dateScartate.push({ etichetta, id: item.id, fields: skipDate, riga: riga.excelRow })

    // Protezione 2 — CF su match per nome: non sovrascrivere un CF già presente
    // e DIVERSO. Se in lista il CF è vuoto, lascia che il file lo riempia.
    if (via === 'nome' && 'CodiceFiscale' in patch && patch.CodiceFiscale) {
      const esist = normCF((item.fields || {}).CodiceFiscale)
      if (esist && normCF(patch.CodiceFiscale) !== esist) {
        cfNonSovrascritti.push({ etichetta, id: item.id, da: esist, a: patch.CodiceFiscale })
        delete patch.CodiceFiscale
      }
    }

    const diffs = diffCampi(patch, item.fields || {})
    if (diffs.length === 0) { invariati++; continue }

    aggiornati++
    console.log(`• ${etichetta}  [match: ${via}, id ${item.id}]`)
    for (const d of diffs) console.log(`    ${d}`)
    if (APPLY) await applicaPatch(item.id, patch, etichetta)
  }

  // ---- INSERIMENTO NUOVI (solo con --inserisci-nuovi) ----
  let creati = 0
  const cfSospetti = []
  const nonInseriti = []
  if (INSERISCI) {
    const allow = new Set(NUOVI_DA_INSERIRE.map(normName))
    console.log('\n— INSERIMENTO NUOVI (righe non abbinate in elenco allowlist):')
    for (const riga of nonTrovati) {
      if (!allow.has(normName(riga.nomeFile))) { nonInseriti.push(riga); continue }
      const nuovo = buildCreate(riga)
      creati++
      const cf = nuovo.CodiceFiscale || ''
      const warn = cf && cf.length !== 16 ? `  ⚠ CF ${cf.length} caratteri (verificare)` : ''
      if (cf && cf.length !== 16) cfSospetti.push(nuovo.Title)
      console.log(`  + ${nuovo.Title}  [${nuovo.CategoriaRU}]  CF=${cf || '∅'}  quota=${nuovo.QuotaSociale ?? '—'}${warn}`)
      if (APPLY) await graph(token, 'POST', `/sites/${site}/lists/${listId}/items`, { fields: nuovo })
    }
    if (creati === 0) console.log('  (nessuna delle righe da inserire risulta non abbinata: forse già presenti)')
  }

  console.log('\n============================================================')
  console.log(`Entità:                 ${ENTITY}`)
  console.log(`Record aggiornati:      ${aggiornati}`)
  console.log(`Record già allineati:   ${invariati}`)
  console.log(`Righe non abbinate:     ${nonTrovati.length}`)
  if (INSERISCI) console.log(`Nuovi record creati:    ${creati}`)
  console.log(`Righe ambigue/saltate:  ${ambigui.length}`)

  const restanti = INSERISCI ? nonInseriti : nonTrovati
  if (restanti.length) {
    console.log('\n— NON ABBINATE (nessun CF/nome corrispondente in questa lista):')
    for (const r of restanti) console.log(`   riga ${r.excelRow}: ${r.nomeFile || '(senza nome)'}  CF=${r.cf || '∅'}`)
  }
  if (cfSospetti.length) {
    console.log('\n— CF DA VERIFICARE nei nuovi inseriti (lunghezza ≠ 16):')
    for (const t of cfSospetti) console.log(`   ${t}`)
  }
  if (ambigui.length) {
    console.log('\n— AMBIGUE (match non univoco, da verificare a mano):')
    for (const a of ambigui) console.log(`   riga ${a.riga.excelRow}: ${a.riga.nomeFile}  [${a.via}]`)
  }
  if (dateScartate.length) {
    console.log('\n— DATE IGNORATE (valore presente ma implausibile, campo non toccato):')
    for (const d of dateScartate) console.log(`   ${d.etichetta} [id ${d.id}] riga ${d.riga}: ${d.fields.join(', ')}`)
  }
  if (cfNonSovrascritti.length) {
    console.log('\n— CF NON SOVRASCRITTI (match per nome, CF diverso — verificare a mano):')
    for (const c of cfNonSovrascritti) console.log(`   ${c.etichetta} [id ${c.id}]  in lista=${c.da}  nel file=${c.a}`)
  }
  if (campiRifiutati.length) {
    console.log(`\n— CAMPI RIFIUTATI da SharePoint (${campiRifiutati.length}) — non scritti, tutto il resto sì:`)
    for (const c of campiRifiutati) console.log(`   ${c.etichetta} [id ${c.id}]  ${c.field} = ${c.valore}`)
  }
  if (!APPLY) console.log('\nRilancia con --apply per scrivere le modifiche su SharePoint.')
}

function lanciatoDirettamente() {
  try { return fileURLToPath(import.meta.url) === (process.argv[1] ? resolve(process.argv[1]) : '') }
  catch { return true }
}

if (lanciatoDirettamente()) {
  main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
}

export { leggiRighe, risolviXlsx, MAP, normCF, normName, trovaMatch, costruisciIndici, toGraphDate, SKIP }
