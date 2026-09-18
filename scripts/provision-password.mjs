#!/usr/bin/env node
/**
 * Provisioning della lista SharePoint "Gestione Password".
 *
 * Crea (se non esiste) la lista con tutte le colonne usate dalla sezione
 * Amministrazione → Gestione Password, usando le credenziali Graph dell'app.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-password.mjs
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SHAREPOINT_SITE_ID
 *
 * Permesso Graph necessario: Sites.ReadWrite.All (Application) — già presente.
 *
 * Idempotente: se la lista esiste già aggiunge solo le colonne mancanti.
 * Al termine stampa la riga SP_LIST_PASSWORD=... da incollare in .env.local e su Vercel.
 *
 * ⚠️ Questa lista contiene credenziali in chiaro. Appena creata, da SharePoint
 * conviene spezzare l'ereditarietà dei permessi e lasciarla ai soli account
 * dell'amministrazione: l'app protegge la schermata, non la lista sottostante,
 * e chi apre il sito SharePoint la troverebbe comunque. Lo script stampa il
 * promemoria e il link diretto alla pagina dei permessi.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const LIST_NAME = 'Gestione Password'

// Deve coincidere con CATEGORIE_PASSWORD in types/password.ts
const CATEGORIE = [
  'Banche e pagamenti',
  'Enti e portali PA',
  'Fornitori',
  'Posta e domini',
  'Sito e social',
  'Software',
  'Strutture',
  'Utenze',
  'WiFi',
  'Altro',
]

// I `name` DEVONO coincidere con quelli usati in lib/password/data.ts
const COLUMNS = [
  { name: 'Categoria', choice: { choices: CATEGORIE, displayAs: 'dropDownMenu' } },
  { name: 'NomeUtente', text: {} },
  { name: 'Password', text: {} },
  { name: 'Pin', text: {} },
  { name: 'LinkSito', text: {} },
  { name: 'TelefonoVerifica', text: {} },
  // Le due date le scrive l'app, non si compilano a mano dalla lista.
  { name: 'DataInserimento', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'UltimaModificaPassword', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'Note', text: { allowMultipleLines: true } },
]

// --- carica .env.local se le env non sono già nell'ambiente ---
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

async function graph(token, method, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
  const existing = await graph(token, 'GET', `/sites/${site}/lists?$select=id,displayName,webUrl&$top=200`)
  const found = (existing.value || []).find((l) => l.displayName === LIST_NAME)
  if (found) {
    console.log(`✓ La lista esiste già. ID = ${found.id}`)
    await ensureColumns(token, site, found.id)
    finale(found.id, found.webUrl)
    return
  }

  console.log('→ Creazione lista + colonne...')
  const created = await graph(token, 'POST', `/sites/${site}/lists`, {
    displayName: LIST_NAME,
    list: { template: 'genericList' },
    columns: COLUMNS,
  })
  console.log(`✓ Lista creata. ID = ${created.id}`)
  finale(created.id, created.webUrl)
}

/**
 * Allinea la lista esistente: colonne mancanti + scelte mancanti di Categoria.
 *
 * Le scelte vanno riallineate a parte perché aggiungere una categoria in
 * `types/password.ts` non tocca SharePoint: l'app mostrerebbe "WiFi" nella
 * tendina, e il salvataggio verrebbe rifiutato dalla colonna choice. Il PATCH
 * sostituisce l'elenco completo, quindi si parte da quello che c'è già e si
 * aggiunge solo il mancante — così una categoria creata a mano su SharePoint
 * non viene cancellata da questo script.
 */
async function ensureColumns(token, site, listId) {
  const cols = await graph(
    token,
    'GET',
    `/sites/${site}/lists/${listId}/columns?$select=id,name,choice&$top=200`,
  )
  const present = new Set((cols.value || []).map((c) => c.name))
  const mancanti = COLUMNS.filter((c) => !present.has(c.name))
  if (!mancanti.length) {
    console.log('✓ Tutte le colonne sono già presenti.')
  }
  for (const col of mancanti) {
    await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, col)
    console.log(`  + colonna aggiunta: ${col.name}`)
  }

  await ensureCategorie(token, site, listId, cols.value || [])
}

/** Aggiunge alla colonna Categoria le sole scelte mancanti (idempotente) */
async function ensureCategorie(token, site, listId, colonne) {
  const cat = colonne.find((c) => c.name === 'Categoria')
  if (!cat) return // appena creata da ensureColumns: ha già tutte le scelte
  const attuali = cat.choice?.choices || []
  const nuove = CATEGORIE.filter((c) => !attuali.includes(c))
  if (!nuove.length) {
    console.log('✓ Le categorie su SharePoint sono già allineate.')
    return
  }
  await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/columns/${cat.id}`, {
    choice: { choices: [...attuali, ...nuove], displayAs: 'dropDownMenu' },
  })
  console.log(`  + categorie aggiunte: ${nuove.join(', ')}`)
}

function finale(id, webUrl) {
  console.log('\n============================================================')
  console.log('Aggiungi questa riga a .env.local e alle Environment Variables su Vercel:')
  console.log(`\n  SP_LIST_PASSWORD=${id}\n`)
  console.log('------------------------------------------------------------')
  console.log('DA FARE SUBITO, una volta sola, da SharePoint:')
  console.log('  restringi i permessi della lista ai soli account amministrazione')
  console.log('  (Impostazioni lista → Autorizzazioni → Interrompi ereditarietà).')
  if (webUrl) console.log(`  Lista: ${webUrl}`)
  console.log('============================================================')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
