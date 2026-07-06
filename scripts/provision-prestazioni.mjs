#!/usr/bin/env node
/**
 * Provisioning della lista SharePoint "Prestazioni Occasionali".
 *
 * Crea (se non esiste) la lista con tutte le colonne necessarie alla sezione
 * Prestazioni Occasionali, usando le credenziali Graph dell'app (client credentials).
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-prestazioni.mjs
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SHAREPOINT_SITE_ID
 *
 * Permesso Graph necessario: Sites.ReadWrite.All (Application) — già presente.
 *
 * Idempotente: se la lista esiste già, NON la ricrea; stampa solo l'ID.
 * Al termine stampa la riga SP_LIST_PRESTAZIONI=... da incollare in .env.local e su Vercel.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const LIST_NAME = 'Prestazioni Occasionali'

// Casistiche GDPR — DEVONO coincidere con le key in lib/casistiche-gdpr.ts
const CASISTICHE_GDPR_KEYS = [
  'UFFICIO',
  'COMUNITA',
  'ARTEMISIA',
  'TERRITORIALE',
  'CPG',
  'LOCANDA',
  'MEDICO',
]

const STATO_CHOICES = [
  'Bozza',
  'Contratto inviato',
  'Contratto firmato',
  'In corso',
  'Importo inserito',
  'Notula inviata',
  'Notula ricevuta',
  'Chiusa',
]

// Definizione colonne (i name DEVONO coincidere con quelli usati in lib/prestazioni.ts)
const COLUMNS = [
  { name: 'Nome', text: {} },
  { name: 'Cognome', text: {} },
  { name: 'DataNascita', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'LuogoNascita', text: {} },
  { name: 'CodiceFiscale', text: {} },
  { name: 'Residenza', text: { allowMultipleLines: true } },
  { name: 'Ruolo', text: {} },
  { name: 'Email', text: {} },
  { name: 'Telefono', text: {} },
  { name: 'Iban', text: {} },
  { name: 'Giorni', number: { decimalPlaces: 'none' } },
  { name: 'DataInizio', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'DataFine', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'Attivita', text: { allowMultipleLines: true } },
  { name: 'CompensoPrevisto', currency: { locale: 'it-IT' } },
  { name: 'CasisticaGdpr', choice: { choices: CASISTICHE_GDPR_KEYS, displayAs: 'dropDownMenu' } },
  { name: 'Stato', choice: { choices: STATO_CHOICES, displayAs: 'dropDownMenu' } },
  { name: 'ResponsabileEmail', text: {} },
  { name: 'ResponsabileNome', text: {} },
  { name: 'CartellaUrl', text: {} },
  { name: 'ImportoLordo', currency: { locale: 'it-IT' } },
  { name: 'DataInserimento', dateTime: { format: 'dateTime', displayAs: 'standard' } },
  // Fase chiusura / notula
  { name: 'NotulaToken', text: {} },
  { name: 'NotulaUrl', text: {} },
  // Promemoria foglio ore (anti-duplicazione invio)
  { name: 'PromemoriaOreInviato', boolean: {} },
  // DocuSign
  { name: 'DocusignEnvelopeId', text: {} },
]

// --- carica .env.local se le env non sono già nell'ambiente ---
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      let val = m[2].replace(/^["']|["']$/g, '')
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
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
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

  // Esiste già?
  console.log(`→ Controllo se la lista "${LIST_NAME}" esiste già...`)
  const existing = await graph(
    token,
    'GET',
    `/sites/${site}/lists?$select=id,displayName&$top=200`,
  )
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
  console.log('Aggiungi questa riga a .env.local e alle Environment Variables su Vercel:')
  console.log(`\n  SP_LIST_PRESTAZIONI=${id}\n`)
  console.log('============================================================')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
