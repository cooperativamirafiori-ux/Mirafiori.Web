#!/usr/bin/env node
/**
 * Provisioning della lista SharePoint "Fatture inviate".
 *
 * Crea (se non esiste) la lista usata dalla sezione Richiesta Fattura, sul sito
 * Controllo Gestione, con le credenziali Graph dell'app.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-fatture.mjs
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SHAREPOINT_SITE_ID
 *
 * Permesso Graph necessario: Sites.ReadWrite.All (Application) — già presente.
 *
 * Idempotente: se la lista esiste già aggiunge solo le colonne mancanti.
 * Al termine stampa la riga SP_LIST_FATTURE=... da incollare in .env.local e su Vercel.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const LIST_NAME = 'Fatture inviate'

// Devono coincidere con types/fatture.ts
const TIPI_SOGGETTO = [
  'Privato',
  'Persona fisica titolare di Partita IVA',
  'Soggetto diverso da persona fisica',
]
const NAZIONALITA = ['Italiana', 'Estera']
const TIPI_DOCUMENTO = ['Fattura', 'Nota di credito', 'Nota di debito']
const MEZZI_PAGAMENTO = ['Contanti', 'Bancomat o carta', 'Bonifico', 'Assegno', 'Altro']

// I `name` DEVONO coincidere con quelli usati in lib/fatture/data.ts.
// Il Title della lista contiene il numero della richiesta (RF-0001).
const COLUMNS = [
  { name: 'CentroCosto', text: {} },
  { name: 'Richiedente', text: {} },
  { name: 'RichiedenteNome', text: {} },

  { name: 'TipoSoggetto', choice: { choices: TIPI_SOGGETTO, displayAs: 'dropDownMenu' } },
  { name: 'Nazionalita', choice: { choices: NAZIONALITA, displayAs: 'dropDownMenu' } },
  { name: 'Condominio', boolean: {} },

  { name: 'Cognome', text: {} },
  { name: 'Nome', text: {} },
  { name: 'RagioneSociale', text: {} },
  { name: 'PartitaIVA', text: {} },
  // Dichiarazione esplicita: diversa da PartitaIVA vuota, che vuol dire solo
  // "non l'ho scritta".
  { name: 'SenzaPartitaIva', boolean: {} },
  { name: 'CodiceFiscale', text: {} },

  { name: 'Indirizzo', text: {} },
  { name: 'Cap', text: {} },
  { name: 'Citta', text: {} },
  { name: 'Provincia', text: {} },
  { name: 'Nazione', text: {} },

  { name: 'Telefono', text: {} },
  { name: 'Email', text: {} },
  { name: 'Pec', text: {} },
  { name: 'CodiceSdi', text: {} },
  // Riga della lista Clienti da cui vengono (o dove sono finiti) i dati.
  { name: 'ClienteId', text: {} },

  { name: 'Descrizione', text: { allowMultipleLines: true } },
  { name: 'Importo', currency: { locale: 'it-IT' } },
  { name: 'DataPrestazione', dateTime: { format: 'dateOnly', displayAs: 'standard' } },

  { name: 'TipoDocumento', choice: { choices: TIPI_DOCUMENTO, displayAs: 'dropDownMenu' } },
  { name: 'RiferimentoDocumento', text: {} },

  // IVA. Restano testo e non numero/scelta: possono contenere "non determinata"
  // o un articolo di esclusione, e l'app non deve rompersi su un valore nuovo.
  { name: 'NaturaImporto', text: {} },
  { name: 'Aliquota', text: {} },
  { name: 'ArticoloEsclusione', text: {} },
  { name: 'Imponibile', currency: { locale: 'it-IT' } },
  { name: 'Iva', currency: { locale: 'it-IT' } },

  { name: 'Incassato', boolean: {} },
  { name: 'MezzoPagamento', choice: { choices: MEZZI_PAGAMENTO, displayAs: 'dropDownMenu' } },
  { name: 'DataIncasso', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  // Giorni fra prestazione e richiesta: serve a vedere a colpo d'occhio, dalla
  // lista, quali servizi mandano le richieste in ritardo.
  { name: 'GiorniRitardo', number: { decimalPlaces: 'none' } },

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
  console.log(`\n  SP_LIST_FATTURE=${id}\n`)
  console.log('Facoltative:')
  console.log('  FATTURE_MAIL_TO=andrea.granato@cooperativamirafiori.com')
  console.log('  SP_LIST_CENTRI_COSTO=<guid>   (quando la lista dei centri di costo esisterà)')
  console.log('============================================================')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
