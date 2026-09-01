#!/usr/bin/env node
/**
 * Messa in funzione dei Flussi fatture — parte SharePoint.
 *
 * Fa tre cose, tutte idempotenti:
 *   1. semina i tre permessi nella lista "Autorizzazioni" per le quattro
 *      persone che oggi devono entrare;
 *   2. aggiunge la riga "SogliaApprovazionePagamenti" alla lista "Parametri"
 *      se non c'è (valore 1500);
 *   3. stampa cosa resta da fare a mano (lo schema Supabase).
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-pagamenti.mjs
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_AUTORIZZAZIONI, SP_LIST_PARAMETRI.
 * Permesso Graph: Sites.ReadWrite.All (Application).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const AREA_CONTROLLO = 'Controllo di Gestione'
const AREA_PAGAMENTI = 'Pagamenti'
const AREA_APPROVAZIONE = 'Approvazione Pagamenti'

const DOMINIO = '@cooperativamirafiori.com'

// Chi entra oggi. Si cambia dal pannello Amministrazione › Permessi: questo
// script serve solo a non dover fare dodici clic la prima volta.
const SEED = [
  { utente: `claudia.carena${DOMINIO}`, aree: [AREA_PAGAMENTI] },
  { utente: `luca.cordaro${DOMINIO}`, aree: [AREA_APPROVAZIONE, AREA_CONTROLLO] },
  { utente: `info${DOMINIO}`, aree: [AREA_PAGAMENTI, AREA_APPROVAZIONE] },
  { utente: `dennis.maseri${DOMINIO}`, aree: [AREA_PAGAMENTI, AREA_APPROVAZIONE, AREA_CONTROLLO] },
]

const PARAMETRO_SOGLIA = { chiave: 'SogliaApprovazionePagamenti', valore: 1500 }

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
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
  const richieste = [
    'GRAPH_TENANT_ID',
    'GRAPH_CLIENT_ID',
    'GRAPH_CLIENT_SECRET',
    'SHAREPOINT_SITE_ID',
    'SP_LIST_AUTORIZZAZIONI',
    'SP_LIST_PARAMETRI',
  ]
  for (const k of richieste) if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)

  const site = process.env.SHAREPOINT_SITE_ID
  const listaAut = process.env.SP_LIST_AUTORIZZAZIONI
  const listaPar = process.env.SP_LIST_PARAMETRI

  console.log('→ Autenticazione Graph...')
  const token = await getToken()

  console.log('\n→ Permessi')
  for (const { utente, aree } of SEED) {
    for (const area of aree) {
      const filter = encodeURIComponent(`fields/Utente eq '${utente}' and fields/Area eq '${area}'`)
      const ex = await graph(
        token,
        'GET',
        `/sites/${site}/lists/${listaAut}/items?$filter=${filter}&$select=id&$top=1`,
        undefined,
        { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
      )
      if ((ex.value || []).length) {
        console.log(`  ✓ già presente: ${utente} → ${area}`)
        continue
      }
      await graph(token, 'POST', `/sites/${site}/lists/${listaAut}/items`, {
        fields: { Title: utente, Utente: utente, Area: area },
      })
      console.log(`  + aggiunto:     ${utente} → ${area}`)
    }
  }

  console.log('\n→ Soglia di approvazione')
  const par = await graph(
    token,
    'GET',
    `/sites/${site}/lists/${listaPar}/items?$select=id&$expand=fields($select=Title,Valore)&$top=200`,
  )
  const esiste = (par.value || []).find(
    (i) => (i.fields?.Title || '').toLowerCase() === PARAMETRO_SOGLIA.chiave.toLowerCase(),
  )
  if (esiste) {
    console.log(`  ✓ già presente: ${PARAMETRO_SOGLIA.chiave} = ${esiste.fields?.Valore}`)
  } else {
    await graph(token, 'POST', `/sites/${site}/lists/${listaPar}/items`, {
      fields: { Title: PARAMETRO_SOGLIA.chiave, Valore: PARAMETRO_SOGLIA.valore },
    })
    console.log(`  + aggiunto:     ${PARAMETRO_SOGLIA.chiave} = ${PARAMETRO_SOGLIA.valore}`)
  }

  console.log('\n============================================================')
  console.log('Resta da fare una volta sola, a mano:')
  console.log('  eseguire supabase/pagamenti_schema.sql nel SQL editor di Supabase.')
  console.log('Nessuna variabile d’ambiente nuova: l’area usa SUPABASE_URL e')
  console.log('SUPABASE_SERVICE_ROLE_KEY, già configurate per le timbrature.')
  console.log('============================================================')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
