#!/usr/bin/env node
/**
 * Manutenzioni, foto della richiesta: aggiunge alla lista SharePoint delle
 * Richieste (`SP_LIST_RICHIESTE`) le colonne dove si ricorda la foto allegata.
 *   · AllegatoUrl  (testo su più righe: l'indirizzo SharePoint supera facilmente i 255 caratteri)
 *   · AllegatoNome (testo)
 *
 * Il file vero sta nella libreria documenti del sito, cartella "Allegati Manutenzioni"
 * (la crea l'app al primo caricamento).
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-manutenzioni-allegato.mjs            SIMULAZIONE
 *   node scripts/provision-manutenzioni-allegato.mjs --apply    esegue
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_RICHIESTE. Idempotente.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

const COLONNE = [
  { name: 'AllegatoUrl', displayName: 'Allegato (indirizzo)', text: { allowMultipleLines: true, textType: 'plain' } },
  { name: 'AllegatoNome', displayName: 'Allegato (nome)', text: { maxLength: 255 } },
]

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
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
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_RICHIESTE']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const lista = process.env.SP_LIST_RICHIESTE
  const token = await getToken()

  console.log('')
  console.log(APPLY ? 'RICHIESTE MANUTENZIONE · FOTO — ESECUZIONE' : 'RICHIESTE MANUTENZIONE · FOTO — SIMULAZIONE (aggiungi --apply)')
  console.log('='.repeat(60))

  const cols = await graph(token, 'GET', `/sites/${site}/lists/${lista}/columns?$top=200`)
  const esistenti = new Map((cols.value ?? []).map((c) => [c.name, c]))

  // --- Colonne nuove ---
  console.log('\nColonne:')
  for (const c of COLONNE) {
    if (esistenti.has(c.name)) {
      console.log(`  ✓ ${c.name} c'è già`)
      continue
    }
    if (!APPLY) {
      console.log(`  + ${c.name} da creare`)
      continue
    }
    await graph(token, 'POST', `/sites/${site}/lists/${lista}/columns`, c)
    console.log(`  + ${c.name} creata`)
  }
  console.log(APPLY ? '\nFatto.' : '\nSimulazione finita: rilancia con --apply.')
}

main().catch((e) => {
  console.error('\nERRORE:', e.message)
  process.exit(1)
})
