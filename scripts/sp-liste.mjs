#!/usr/bin/env node
/**
 * Elenca le liste SharePoint di un sito con il loro GUID.
 *
 * Serve quando manca un valore SP_LIST_* in .env.local: i GUID non si possono
 * recuperare da `vercel env pull` se la variabile è marcata "sensitive" (Vercel
 * restituisce "[SENSITIVE]"), ma si rileggono sempre da Graph.
 *
 * Uso (da web/):
 *   node scripts/sp-liste.mjs                    # sito da SHAREPOINT_SITE_ID
 *   node scripts/sp-liste.mjs --ru               # sito Risorse Umane (SP_SITE_RU)
 *   node scripts/sp-liste.mjs --site=<siteId>    # sito esplicito
 *   node scripts/sp-liste.mjs --env              # stampa righe SP_LIST_*= pronte
 *
 * Identità applicativa: richiede GRAPH_TENANT_ID / _CLIENT_ID / _CLIENT_SECRET.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Nome lista SharePoint → variabile d'ambiente che ne conserva il GUID. */
const ENV_PER_LISTA = {
  Strutture: 'SP_LIST_STRUTTURE',
  Tecnici: 'SP_LIST_TECNICI',
  Richieste: 'SP_LIST_RICHIESTE',
  Costi: 'SP_LIST_COSTI',
  Parametri: 'SP_LIST_PARAMETRI',
  Autorizzazioni: 'SP_LIST_AUTORIZZAZIONI',
  Prestazioni: 'SP_LIST_PRESTAZIONI',
  Software: 'SP_LIST_SOFTWARE',
  Dipendenti: 'SP_LIST_DIPENDENTI',
  Tirocini: 'SP_LIST_TIROCINI',
  'Log Attività': 'SP_LIST_LOG',
}

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

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  const argSite = process.argv.find((a) => a.startsWith('--site='))?.slice(7)
  const usaRU = process.argv.includes('--ru')
  const soloEnv = process.argv.includes('--env')

  const site = argSite || (usaRU ? process.env.SP_SITE_RU : null) || process.env.SHAREPOINT_SITE_ID
  if (!site) throw new Error('Sito non indicato: usa --site=<id>, --ru, oppure imposta SHAREPOINT_SITE_ID')

  const token = await getToken()
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site}/lists?$select=id,displayName,list&$top=200`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const testo = await res.text()
  if (!res.ok) throw new Error(`GET lists → ${res.status}: ${testo.slice(0, 300)}`)
  const liste = (JSON.parse(testo).value || [])
    // esclude le raccolte documenti e le liste di sistema: qui interessano gli elenchi
    .filter((l) => l.list?.template === 'genericList')
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  if (soloEnv) {
    for (const l of liste) {
      const env = ENV_PER_LISTA[l.displayName]
      if (env) console.log(`${env}=${l.id}`)
      else console.log(`# ${l.displayName} → nessuna env nota: ${l.id}`)
    }
    return
  }

  console.log(`\nSito: ${site}\n`)
  console.log('Lista'.padEnd(28) + 'GUID'.padEnd(38) + 'Variabile')
  console.log('-'.repeat(28) + '-'.repeat(38) + '-'.repeat(24))
  for (const l of liste) {
    console.log(
      l.displayName.padEnd(28) + l.id.padEnd(38) + (ENV_PER_LISTA[l.displayName] ?? '—'),
    )
  }
  console.log(`\n${liste.length} liste. Per le righe pronte da incollare: aggiungi --env\n`)
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
