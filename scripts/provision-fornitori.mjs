#!/usr/bin/env node
/**
 * Anagrafica Fornitori di Manutenzioni: aggiunge alla lista SharePoint dei
 * Tecnici (`SP_LIST_TECNICI`) le colonne che mancano per farne un'anagrafica:
 *   PartitaIva (testo) · Pec (testo) · Indirizzo (testo) · Note (testo multiriga)
 *
 * Mostra anche le colonne che ci sono già e quanti fornitori contiene la lista.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-fornitori.mjs            SIMULAZIONE
 *   node scripts/provision-fornitori.mjs --apply    esegue
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_TECNICI. Idempotente.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

const COLONNE = [
  { name: 'PartitaIva', displayName: 'Partita IVA', text: { maxLength: 30 } },
  { name: 'Pec', displayName: 'PEC', text: { maxLength: 255 } },
  { name: 'Indirizzo', displayName: 'Indirizzo', text: { maxLength: 255 } },
  { name: 'Note', displayName: 'Note', text: { allowMultipleLines: true, linesForEditing: 4 } },
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
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_TECNICI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const lista = process.env.SP_LIST_TECNICI
  const token = await getToken()

  console.log('')
  console.log(APPLY ? 'ANAGRAFICA FORNITORI — ESECUZIONE' : 'ANAGRAFICA FORNITORI — SIMULAZIONE (aggiungi --apply)')
  console.log('='.repeat(60))

  const voci = await graph(token, 'GET', `/sites/${site}/lists/${lista}/items?$select=id&$expand=fields($select=Title,Ditta)&$top=999`)
  console.log(`\nFornitori già presenti nella lista Tecnici: ${(voci.value ?? []).length}`)
  for (const v of voci.value ?? []) console.log(`  · ${v.fields?.Title ?? '(senza nome)'}${v.fields?.Ditta ? ` — ${v.fields.Ditta}` : ''}`)

  const cols = await graph(token, 'GET', `/sites/${site}/lists/${lista}/columns?$top=200`)
  const esistenti = new Set((cols.value ?? []).map((c) => c.name))
  const spec = (cols.value ?? []).find((c) => c.name === 'Specializzazione')
  console.log(`\nSpecializzazione: ${spec?.choice ? `scelta fra ${spec.choice.choices.join(', ')}` : 'testo libero'}`)

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
  console.log(APPLY ? '\nFatto.' : '\nSimulazione finita: rilancia con --apply per creare le colonne.')
}

main().catch((e) => {
  console.error('\nERRORE:', e.message)
  process.exit(1)
})
