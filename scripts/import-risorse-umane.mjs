#!/usr/bin/env node
/**
 * Import una-tantum dei dati Risorse Umane nelle liste SharePoint create da
 * provision-risorse-umane.mjs.
 *
 * Legge i file JSON (estratti dal database Access) dalla cartella:
 *   web/scripts/ru-data/dipendenti.json
 *   web/scripts/ru-data/collaboratori.json
 *   web/scripts/ru-data/tirocini.json
 * (Puoi cambiare la cartella con la variabile RU_DATA_DIR.)
 *
 * Uso (dalla cartella web/):
 *   node scripts/import-risorse-umane.mjs            # importa tutto
 *   node scripts/import-risorse-umane.mjs dipendenti # solo una lista
 *
 * IDEMPOTENTE: salta i record il cui IdAccess è già presente nella lista,
 * quindi puoi rilanciarlo senza creare duplicati.
 *
 * NB: i JSON contengono dati personali — la cartella ru-data/ è in .gitignore.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.RU_DATA_DIR || join(__dirname, 'ru-data')

// Campi che rappresentano una data (scritti a mezzogiorno UTC)
const DATE_FIELDS = new Set([
  'DataNascita', 'DataAssunzione', 'DataAmmissioneSocio', 'DataDimissioneLavoratore',
  'DataDimissioneSocio', 'DataInizio', 'DataFine',
])

const SOURCES = [
  { key: 'dipendenti', file: 'dipendenti.json', envKey: 'SP_LIST_DIPENDENTI', label: 'Dipendenti' },
  { key: 'collaboratori', file: 'collaboratori.json', envKey: 'SP_LIST_COLLABORATORI', label: 'Collaboratori' },
  { key: 'tirocini', file: 'tirocini.json', envKey: 'SP_LIST_TIROCINI', label: 'Tirocini' },
]

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const val = m[2].replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = val
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
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${t}`)
  return t ? JSON.parse(t) : {}
}

/** Costruisce i campi SP dal record JSON: null/'' scartati, date normalizzate. */
function buildFields(rec) {
  const out = {}
  for (const [k, v] of Object.entries(rec)) {
    if (v === null || v === undefined || v === '') continue
    if (DATE_FIELDS.has(k)) {
      const g = String(v).slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(g)) out[k] = `${g}T12:00:00Z`
      continue
    }
    out[k] = v
  }
  return out
}

/** Recupera gli IdAccess già presenti nella lista (per idempotenza). */
async function existingIdAccess(token, site, listId) {
  const set = new Set()
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=IdAccess)&$top=500`
  while (url) {
    const res = await graph(token, 'GET', url)
    for (const it of res.value || []) {
      const v = it.fields?.IdAccess
      if (v !== undefined && v !== null) set.add(Number(v))
    }
    url = res['@odata.nextLink'] ? res['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return set
}

async function importSource(token, site, src) {
  const listId = process.env[src.envKey]
  if (!listId) { console.log(`\n⚠ ${src.label}: ${src.envKey} non impostato in .env.local — salto`); return }
  const path = join(DATA_DIR, src.file)
  if (!existsSync(path)) { console.log(`\n⚠ ${src.label}: file mancante ${path} — salto`); return }

  const records = JSON.parse(readFileSync(path, 'utf8'))
  console.log(`\n→ ${src.label}: ${records.length} record da ${src.file}`)

  const gia = await existingIdAccess(token, site, listId)
  let creati = 0, saltati = 0, errori = 0
  for (const rec of records) {
    if (rec.IdAccess != null && gia.has(Number(rec.IdAccess))) { saltati++; continue }
    try {
      await graph(token, 'POST', `/sites/${site}/lists/${listId}/items`, { fields: buildFields(rec) })
      creati++
      if (creati % 25 === 0) console.log(`   ...${creati} creati`)
    } catch (e) {
      errori++
      console.error(`   ✗ ${rec.Title}: ${e.message.slice(0, 200)}`)
    }
  }
  console.log(`  ✓ ${src.label}: ${creati} creati, ${saltati} già presenti, ${errori} errori`)
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const only = process.argv[2]?.toLowerCase()
  const sources = only ? SOURCES.filter((s) => s.key === only) : SOURCES
  if (only && !sources.length) throw new Error(`Sorgente sconosciuta: ${only} (usa: dipendenti|collaboratori|tirocini)`)

  console.log('→ Autenticazione Graph...')
  const token = await getToken()
  for (const src of sources) await importSource(token, site, src)
  console.log('\n✓ Import completato.')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
