#!/usr/bin/env node
/**
 * Provisioning della lista SharePoint "Clienti".
 *
 * Anagrafica dei clienti a cui si intestano le fatture, sul sito Controllo
 * Gestione. La riempie `scripts/import-clienti.mjs` partendo dall'export del
 * gestionale di fatturazione; da lì in avanti la tiene aggiornata l'app, che
 * salva i clienti nuovi e le correzioni fatte in sede di richiesta fattura.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-clienti.mjs
 *
 * Idempotente: se la lista esiste già aggiunge solo le colonne mancanti.
 * Al termine stampa la riga SP_LIST_CLIENTI=... da incollare in .env.local e su Vercel.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const LIST_NAME = 'Clienti'

// Devono coincidere con types/fatture.ts
const TIPI_SOGGETTO = [
  'Privato',
  'Persona fisica titolare di Partita IVA',
  'Soggetto diverso da persona fisica',
]

/**
 * I `name` DEVONO coincidere con quelli usati in lib/clienti/data.ts.
 * Il Title contiene la denominazione: è il campo su cui si cerca, e SharePoint
 * mostra il Title come etichetta della riga.
 *
 * Scadenza, TipoPagamento e AddebitoBollo restano **testo** e non scelte: sono
 * dati che arrivano dal gestionale e l'app non li interpreta, quindi un valore
 * nuovo di là non deve fare fallire un salvataggio di qua.
 */
const COLUMNS = [
  { name: 'Cognome', text: {} },
  { name: 'Nome', text: {} },
  { name: 'TipoSoggetto', choice: { choices: TIPI_SOGGETTO, displayAs: 'dropDownMenu' } },

  { name: 'Indirizzo', text: {} },
  { name: 'Comune', text: {} },
  { name: 'Cap', text: {} },
  { name: 'Provincia', text: {} },
  { name: 'Nazione', text: {} },

  { name: 'PartitaIVA', text: {} },
  { name: 'CodiceFiscale', text: {} },
  { name: 'CodiceEstero', text: {} },

  { name: 'Cellulare', text: {} },
  { name: 'Telefono', text: {} },
  { name: 'Email', text: {} },
  { name: 'Pec', text: {} },

  { name: 'CodiceSdi', text: {} },
  { name: 'CodiceIpa', text: {} },

  { name: 'Scadenza', text: {} },
  { name: 'TipoPagamento', text: {} },
  { name: 'AddebitoBollo', text: {} },
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
  if (found) {
    console.log(`✓ La lista esiste già. ID = ${found.id}`)
    await ensureColumns(token, site, found.id)
    printEnv(found.id)
    return
  }

  console.log('→ Creazione lista + colonne...')
  const created = await graph(token, 'POST', `/sites/${site}/lists`, {
    displayName: LIST_NAME,
    list: { template: 'genericList' },
    columns: COLUMNS,
  })
  console.log(`✓ Lista creata. ID = ${created.id}`)
  printEnv(created.id)
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

function printEnv(id) {
  console.log('\n============================================================')
  console.log('Aggiungi questa riga a .env.local e alle Environment Variables su Vercel:')
  console.log(`\n  SP_LIST_CLIENTI=${id}\n`)
  console.log('Poi importa l\'anagrafica:')
  console.log('  node scripts/import-clienti.mjs ../Clienti_Full.xlsx --prova')
  console.log('============================================================')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
