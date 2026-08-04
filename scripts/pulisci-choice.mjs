#!/usr/bin/env node
/**
 * Rimuove un valore da una colonna Choice di una lista SharePoint.
 *
 * Serve perché `provision-*.mjs` è volutamente **additivo**: `estendiChoice`
 * aggiunge i valori mancanti e non tocca gli altri, così rilanciare uno script
 * di provisioning non può cancellare per sbaglio scelte in uso. Quando invece un
 * valore va ritirato per davvero, si usa questo.
 *
 * ⚠️ Togliere un valore da una Choice NON cambia le righe che lo contengono: il
 * dato resta scritto ma diventa fuori elenco, e SharePoint lo segnala come non
 * valido appena qualcuno modifica quella riga. Per questo lo script conta prima
 * quante righe usano il valore e si ferma se ne trova, a meno di --forza.
 *
 * Uso (dalla cartella web/):
 *   node scripts/pulisci-choice.mjs --lista "Richieste Acquisto" --colonna EsitoConsegna --valore "Non arrivato"
 *   node scripts/pulisci-choice.mjs ... --forza      # rimuove anche se ci sono righe che lo usano
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID. Permesso Graph: Sites.ReadWrite.All (Application).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, '..', '.env.local')

const FORZA = process.argv.includes('--forza')

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const NOME_LISTA = arg('lista')
const COLONNA = arg('colonna')
const VALORE = arg('valore')

function loadEnvLocal() {
  try {
    const raw = readFileSync(ENV_PATH, 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
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
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

async function main() {
  loadEnvLocal()
  if (!NOME_LISTA || !COLONNA || !VALORE) {
    throw new Error(
      'Uso: node scripts/pulisci-choice.mjs --lista "<nome lista>" --colonna <NomeInterno> --valore "<valore>"',
    )
  }
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const token = await getToken()

  const liste = await graph(token, 'GET', `/sites/${site}/lists?$select=id,displayName&$top=200`)
  const lista = (liste.value || []).find((l) => l.displayName === NOME_LISTA)
  if (!lista) throw new Error(`Lista "${NOME_LISTA}" non trovata sul sito.`)

  const cols = await graph(
    token, 'GET', `/sites/${site}/lists/${lista.id}/columns?$select=id,name,choice&$top=200`,
  )
  const col = (cols.value || []).find((c) => c.name === COLONNA)
  if (!col) throw new Error(`Colonna "${COLONNA}" non trovata nella lista.`)
  if (!col.choice) throw new Error(`"${COLONNA}" non è una colonna Choice.`)

  const scelte = col.choice.choices || []
  if (!scelte.includes(VALORE)) {
    console.log(`✓ "${VALORE}" non è fra le scelte di ${COLONNA}: niente da fare.`)
    console.log(`  Scelte attuali: ${scelte.map((s) => `"${s}"`).join(', ')}`)
    return
  }

  // Quante righe usano il valore: leggo la sola colonna interessata.
  const items = await graph(
    token, 'GET',
    `/sites/${site}/lists/${lista.id}/items?$select=id,fields&$expand=fields($select=${COLONNA})&$top=2000`,
    undefined,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
  )
  const usate = (items.value || []).filter((i) => i.fields?.[COLONNA] === VALORE)

  if (usate.length && !FORZA) {
    console.log(`✗ ${usate.length} righe usano ancora "${VALORE}": non rimuovo niente.`)
    console.log(`  ID: ${usate.map((i) => i.id).join(', ')}`)
    console.log('  Correggile prima, oppure rilancia con --forza se sai cosa stai facendo.')
    process.exitCode = 1
    return
  }
  if (usate.length) {
    console.log(`⚠ ${usate.length} righe usano "${VALORE}": procedo comunque (--forza).`)
    console.log('  Quelle righe resteranno con un valore fuori elenco.')
  }

  await graph(token, 'PATCH', `/sites/${site}/lists/${lista.id}/columns/${col.id}`, {
    choice: { ...col.choice, choices: scelte.filter((s) => s !== VALORE) },
  })
  console.log(`✓ "${VALORE}" rimosso da ${NOME_LISTA}.${COLONNA}`)
  console.log(`  Scelte rimaste: ${scelte.filter((s) => s !== VALORE).map((s) => `"${s}"`).join(', ')}`)
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
