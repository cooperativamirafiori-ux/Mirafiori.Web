#!/usr/bin/env node
/**
 * Provisioning della lista SharePoint "Autorizzazioni" (permessi per area).
 *
 * Crea (se non esiste) la lista con le colonne:
 *   - Utente (Testo, contiene l'email dell'utente)
 *   - Area   (Scelta, es. "Amministrazione"; consente anche valori liberi)
 * Ogni riga = un permesso concesso a un utente.
 *
 * Nota: Utente è Testo (non Persona) perché il filtro Graph
 *   `fields/Utente eq 'email'` funziona in modo affidabile solo su colonne testo.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-autorizzazioni.mjs
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SHAREPOINT_SITE_ID
 * Permesso Graph: Sites.ReadWrite.All (Application).
 *
 * Idempotente: se la lista esiste già non la ricrea; aggiunge solo le colonne mancanti.
 * Semina una riga per l'amministratore iniziale (Dennis) se non già presente.
 * Al termine stampa la riga SP_LIST_AUTORIZZAZIONI=... da incollare in .env.local e su Vercel.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const LIST_NAME = 'Autorizzazioni'

const AREA_CHOICES = ['Amministrazione', 'Prestazioni Occasionali']

// Amministratore/i iniziali da seminare (Utente = email, Area)
const SEED = [
  { Utente: 'dennis.maseri@cooperativamirafiori.com', Area: 'Amministrazione' },
]

const COLUMNS = [
  { name: 'Utente', text: {} },
  { name: 'Area', choice: { choices: AREA_CHOICES, displayAs: 'dropDownMenu', allowTextEntry: true } },
]

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      const val = m[2].replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // .env.local assente: si presume env già impostate
  }
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(
    `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: GRAPH_CLIENT_ID,
        client_secret: GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  )
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

async function graph(token, method, path, body, extraHeaders = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

async function main() {
  loadEnvLocal()
  const site = process.env.SHAREPOINT_SITE_ID
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  console.log('→ Autenticazione Graph...')
  const token = await getToken()

  console.log(`→ Controllo se la lista "${LIST_NAME}" esiste già...`)
  const existing = await graph(
    token,
    'GET',
    `/sites/${site}/lists?$select=id,displayName&$top=200`,
  )
  const found = (existing.value || []).find((l) => l.displayName === LIST_NAME)

  let listId
  if (found) {
    console.log(`✓ La lista esiste già. ID = ${found.id}`)
    listId = found.id
    await ensureColumns(token, site, listId)
  } else {
    console.log('→ Creazione lista + colonne...')
    const created = await graph(token, 'POST', `/sites/${site}/lists`, {
      displayName: LIST_NAME,
      list: { template: 'genericList' },
      columns: COLUMNS,
    })
    listId = created.id
    console.log(`✓ Lista creata. ID = ${listId}`)
  }

  await seedRows(token, site, listId)
  printEnv(listId)
}

async function ensureColumns(token, site, listId) {
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
  const present = new Set((cols.value || []).map((c) => c.name))
  const mancanti = COLUMNS.filter((c) => !present.has(c.name))
  if (!mancanti.length) {
    console.log('✓ Tutte le colonne sono già presenti.')
    return
  }
  for (const col of mancanti) {
    await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, col)
    console.log(`  + colonna aggiunta: ${col.name}`)
  }
}

async function seedRows(token, site, listId) {
  for (const row of SEED) {
    const filter = encodeURIComponent(`fields/Utente eq '${row.Utente}' and fields/Area eq '${row.Area}'`)
    const ex = await graph(
      token,
      'GET',
      `/sites/${site}/lists/${listId}/items?$filter=${filter}&$select=id&$top=1`,
      undefined,
      { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
    )
    if ((ex.value || []).length) {
      console.log(`✓ Permesso già presente: ${row.Utente} → ${row.Area}`)
      continue
    }
    await graph(token, 'POST', `/sites/${site}/lists/${listId}/items`, {
      fields: { Title: row.Utente, Utente: row.Utente, Area: row.Area },
    })
    console.log(`  + permesso aggiunto: ${row.Utente} → ${row.Area}`)
  }
}

function printEnv(id) {
  console.log('\n============================================================')
  console.log('Aggiungi questa riga a .env.local e alle Environment Variables su Vercel:')
  console.log(`\n  SP_LIST_AUTORIZZAZIONI=${id}\n`)
  console.log('============================================================')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
