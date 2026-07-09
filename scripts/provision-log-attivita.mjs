#!/usr/bin/env node
/**
 * Provisioning della lista SharePoint "Log Attività" (audit applicativo)
 * + impostazione della variabile SP_LIST_LOG su Vercel.
 *
 * Cosa fa:
 *   1. Crea (se non esiste) la lista "Log Attività" con le colonne usate da
 *      lib/audit.ts, tramite le credenziali Graph dell'app.
 *   2. Stampa la riga SP_LIST_LOG=... da incollare in .env.local.
 *   3. Se la CLI di Vercel è disponibile, imposta SP_LIST_LOG su
 *      production/preview/development (a meno di --no-vercel).
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-log-attivita.mjs            # lista + Vercel
 *   node scripts/provision-log-attivita.mjs --no-vercel # solo lista SharePoint
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SHAREPOINT_SITE_ID
 *
 * Permesso Graph necessario: Sites.ReadWrite.All (Application) — già presente.
 * Idempotente: se la lista esiste già, aggiunge solo le colonne mancanti.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))

const LIST_NAME = 'Log Attività'
const ENV_KEY = 'SP_LIST_LOG'
const SKIP_VERCEL = process.argv.includes('--no-vercel')

// I `name` DEVONO coincidere con quelli scritti da lib/audit.ts (ASCII, no spazi).
// "Title" esiste già di default e ospita il codice azione.
const COLUMNS = [
  { name: 'Utente', text: {} },
  { name: 'UtenteNome', text: {} },
  { name: 'Entita', text: {} },
  { name: 'EntitaId', text: {} },
  { name: 'Esito', text: {} },
  { name: 'Dettagli', text: { allowMultipleLines: true } },
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
  const existing = await graph(token, 'GET', `/sites/${site}/lists?$select=id,displayName&$top=200`)
  const found = (existing.value || []).find((l) => l.displayName === LIST_NAME)

  let listId
  if (found) {
    console.log(`✓ La lista esiste già. ID = ${found.id}`)
    await ensureColumns(token, site, found.id)
    listId = found.id
  } else {
    console.log('→ Creazione lista + colonne...')
    const created = await graph(token, 'POST', `/sites/${site}/lists`, {
      displayName: LIST_NAME,
      list: { template: 'genericList' },
      columns: COLUMNS,
    })
    console.log(`✓ Lista creata. ID = ${created.id}`)
    listId = created.id
  }

  printEnv(listId)

  if (SKIP_VERCEL) {
    console.log('\n(--no-vercel) Passaggio Vercel saltato.')
  } else {
    setVercelEnv(listId)
  }
}

/** Aggiunge alla lista esistente le sole colonne mancanti (idempotente) */
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

function printEnv(id) {
  console.log('\n============================================================')
  console.log('Aggiungi questa riga a .env.local:')
  console.log(`\n  ${ENV_KEY}=${id}\n`)
  console.log('============================================================')
}

/**
 * Imposta SP_LIST_LOG su Vercel per i tre ambienti.
 * Usa la CLI `vercel`; se non è installata o il progetto non è collegato,
 * stampa i comandi pronti da lanciare a mano.
 */
function setVercelEnv(id) {
  const hasVercel = spawnSync('vercel', ['--version'], { encoding: 'utf8' }).status === 0
  if (!hasVercel) {
    console.log('\n⚠ CLI Vercel non trovata. Installa con `npm i -g vercel`, poi lancia:')
    printVercelCommands(id)
    return
  }

  console.log('\n→ Imposto la variabile su Vercel (production, preview, development)...')
  let allOk = true
  for (const target of ['production', 'preview', 'development']) {
    // `vercel env add <key> <target>` legge il valore da stdin
    const r = spawnSync('vercel', ['env', 'add', ENV_KEY, target], {
      input: id,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (r.status === 0) {
      console.log(`  ✓ ${target}`)
    } else {
      allOk = false
      const msg = (r.stderr || r.stdout || '').trim().split('\n').slice(-1)[0]
      // Caso tipico: la variabile esiste già per quell'ambiente
      console.log(`  ✗ ${target} — ${msg || 'errore'} (probabilmente già presente)`)
    }
  }

  if (!allOk) {
    console.log('\nSe qualche ambiente è fallito perché la variabile esisteva già,')
    console.log('rimuovila e reinseriscila, oppure usa i comandi manuali:')
    printVercelCommands(id)
  } else {
    console.log('\n✓ Variabile impostata su Vercel. Serve un nuovo deploy per applicarla.')
  }
}

function printVercelCommands(id) {
  console.log('')
  for (const target of ['production', 'preview', 'development']) {
    console.log(`  printf '%s' '${id}' | vercel env add ${ENV_KEY} ${target}`)
  }
  console.log('')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
