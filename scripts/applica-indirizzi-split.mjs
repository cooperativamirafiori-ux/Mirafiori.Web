#!/usr/bin/env node
/**
 * Applica alla lista SharePoint Dipendenti (che include anche i Collaboratori)
 * il file di lavoro "Dipendenti_indirizzi_split.xlsx" — Residenza e Domicilio
 * spezzati in Indirizzo/CAP/Comune, rivisto e corretto a mano da Dennis
 * (righe gialle/rosse) l'08-08-2026. Sostituisce lo split automatico di
 * scripts/migra-residenza-citta-indirizzo.mjs (superato).
 *
 * Scrive SOLO le 6 colonne nuove (vedi types/risorse-umane.ts):
 *   IndirizzoResidenza, CapResidenza, ComuneResidenza,
 *   IndirizzoDomicilio, CapDomicilio, ComuneDomicilio
 * Non tocca né elimina "Residenza"/"Domicilio"/"CittaResidenza" originali:
 * restano come storico.
 *
 * MATCH: per Matricola; se manca su un lato o sull'altro, fallback su Codice
 * Fiscale (stesso criterio di scripts/import-cedolini-dipendenti.mjs). Righe
 * del file senza Matricola né Codice Fiscale vengono ignorate.
 *
 * Se una cella del file è vuota, il campo SharePoint corrispondente NON viene
 * toccato (non si scrivono valori vuoti sopra dati eventualmente già presenti).
 *
 * Legge il foglio "Indirizzi split" del file (quello con i dati; il foglio
 * "Legenda" viene ignorato). Riconosce le colonne dalle INTESTAZIONI, non
 * dalla posizione: puoi aggiungere/spostare colonne nel file senza rompere lo
 * script, basta non cambiare il testo delle intestazioni.
 *
 * PREREQUISITO: aver già rilanciato node scripts/provision-risorse-umane.mjs
 * (devono esistere le 6 colonne nuove).
 *
 * USO (dalla cartella web/):
 *   node scripts/applica-indirizzi-split.mjs <percorso.xlsx>            # dry-run
 *   node scripts/applica-indirizzi-split.mjs <percorso.xlsx> --apply    # applica
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SP_LIST_DIPENDENTI, e il sito (SP_SITE_RU se impostato, altrimenti SHAREPOINT_SITE_ID).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ExcelJS from 'exceljs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const FILE_PATH = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null

// Colonne SharePoint da scrivere.
const CAMPI = [
  'IndirizzoResidenza', 'CapResidenza', 'ComuneResidenza',
  'IndirizzoDomicilio', 'CapDomicilio', 'ComuneDomicilio',
]

// Intestazione (testo in riga 1 del file) -> chiave del record letto.
const MAPPA_INTESTAZIONI = {
  Matricola: 'Matricola',
  'Codice Fiscale': 'CodiceFiscale',
  Cognome: 'Cognome',
  Nome: 'Nome',
  'Indirizzo Residenza': 'IndirizzoResidenza',
  'CAP Residenza': 'CapResidenza',
  'Comune Residenza': 'ComuneResidenza',
  'Indirizzo Domicilio': 'IndirizzoDomicilio',
  'CAP Domicilio': 'CapDomicilio',
  'Comune Domicilio': 'ComuneDomicilio',
}

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

async function getAll(token, site, listId, select) {
  const out = []
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=${select})&$top=200`
  while (url) {
    const res = await graph(token, 'GET', url)
    out.push(...(res.value || []))
    const next = res['@odata.nextLink']
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

const has = (v) => v != null && String(v).trim() !== ''
const normCF = (s) => (s == null ? '' : String(s).replace(/\s/g, '').toUpperCase())
const normMatricola = (s) => (s == null ? '' : String(s).trim())

/** Legge il foglio dati del file di lavoro, riconoscendo le colonne dall'intestazione. */
async function leggiFile(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.getWorksheet('Indirizzi split') || wb.worksheets[0]
  if (!ws) throw new Error('Nessun foglio trovato nel file.')

  const headerRow = ws.getRow(1)
  const headers = []
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => { headers[col] = String(cell.text || '').trim() })

  const righe = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const rec = {}
    headers.forEach((h, col) => {
      const key = MAPPA_INTESTAZIONI[h]
      if (key) rec[key] = String(row.getCell(col).text || '').trim()
    })
    if (!has(rec.Matricola) && !has(rec.CodiceFiscale)) return // riga senza chiave di match: ignorata
    righe.push(rec)
  })
  return righe
}

async function main() {
  if (!FILE_PATH) {
    throw new Error('Indica il percorso del file .xlsx: node scripts/applica-indirizzi-split.mjs <percorso.xlsx> [--apply]')
  }
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SP_LIST_DIPENDENTI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  if (!site) throw new Error('Sito non indicato: imposta SP_SITE_RU o SHAREPOINT_SITE_ID')
  const lista = process.env.SP_LIST_DIPENDENTI
  console.log(`→ File: ${FILE_PATH}`)
  console.log(`→ Sito: ${site}  |  Lista: ${lista}`)
  console.log(`→ Modalità: ${APPLY ? 'APPLICA (scrive su SharePoint)' : 'DRY-RUN (nessuna modifica)'}\n`)

  const token = await getToken()

  const cols = await graph(token, 'GET', `/sites/${site}/lists/${lista}/columns?$select=name&$top=300`)
  for (const nome of CAMPI) {
    if (!(cols.value || []).some((c) => c.name === nome)) {
      throw new Error(`La colonna "${nome}" non esiste ancora. Esegui prima: node scripts/provision-risorse-umane.mjs`)
    }
  }

  const righeFile = await leggiFile(FILE_PATH)
  console.log(`→ Righe nel file (con Matricola o Codice Fiscale): ${righeFile.length}`)

  const items = await getAll(token, site, lista, ['Matricola', 'CodiceFiscale', 'Cognome', 'Nome', ...CAMPI].join(','))
  const perMatricola = new Map()
  const perCF = new Map()
  for (const it of items) {
    const f = it.fields || {}
    const m = normMatricola(f.Matricola); if (m) perMatricola.set(m, it)
    const cf = normCF(f.CodiceFiscale); if (cf) perCF.set(cf, it)
  }

  let aggiornati = 0
  let senzaDati = 0
  let nonTrovati = 0
  const nonTrovatiList = []

  for (const r of righeFile) {
    const nome = `${r.Cognome ?? ''} ${r.Nome ?? ''}`.trim() || r.Matricola || r.CodiceFiscale
    const match =
      (has(r.Matricola) && perMatricola.get(normMatricola(r.Matricola))) ||
      (has(r.CodiceFiscale) && perCF.get(normCF(r.CodiceFiscale)))

    if (!match) {
      nonTrovati++
      nonTrovatiList.push(`${nome}  (Matricola=${r.Matricola || '∅'}, CF=${r.CodiceFiscale || '∅'})`)
      continue
    }

    const payload = {}
    for (const campo of CAMPI) if (has(r[campo])) payload[campo] = r[campo]
    if (Object.keys(payload).length === 0) { senzaDati++; continue }

    aggiornati++
    console.log(`  ✓ "${nome}"  ${Object.entries(payload).map(([k, v]) => `${k}=${v}`).join(', ')}`)

    if (APPLY) {
      await graph(token, 'PATCH', `/sites/${site}/lists/${lista}/items/${match.id}/fields`, payload)
    }
  }

  console.log('\n============================================================')
  console.log(`Record aggiornati:              ${aggiornati}`)
  console.log(`Record senza dati da scrivere:   ${senzaDati}`)
  console.log(`Non trovati in SharePoint:       ${nonTrovati}`)
  if (nonTrovatiList.length) {
    console.log('\n— NON TROVATI (controllare Matricola/Codice Fiscale nel file):')
    for (const s of nonTrovatiList) console.log(`   ${s}`)
  }
  if (!APPLY) console.log('\nRilancia con --apply per scrivere le modifiche su SharePoint.')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
