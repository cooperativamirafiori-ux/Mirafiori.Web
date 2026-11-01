#!/usr/bin/env node
/**
 * Manutenzioni, fase 1 della "pratica" (docs/manutenzioni-piano.md): prepara la
 * lista SharePoint delle Richieste (`SP_LIST_RICHIESTE`).
 *   · colonna Stato: aggiunge la scelta "Presa in carico" (fra Aperta e In lavorazione)
 *   · LungoCorso (sì/no) · PrevisioneLungoCorso (testo)
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-manutenzioni-pratica.mjs            SIMULAZIONE
 *   node scripts/provision-manutenzioni-pratica.mjs --apply    esegue
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_RICHIESTE. Idempotente.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

const NUOVO_STATO = 'Presa in carico'
const COLONNE = [
  { name: 'LungoCorso', displayName: 'Lungo corso', boolean: {}, defaultValue: { value: '0' } },
  { name: 'PrevisioneLungoCorso', displayName: 'Previsione lungo corso', text: { maxLength: 255 } },
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
  console.log(APPLY ? 'RICHIESTE MANUTENZIONE — ESECUZIONE' : 'RICHIESTE MANUTENZIONE — SIMULAZIONE (aggiungi --apply)')
  console.log('='.repeat(60))

  const cols = await graph(token, 'GET', `/sites/${site}/lists/${lista}/columns?$top=200`)
  const esistenti = new Map((cols.value ?? []).map((c) => [c.name, c]))

  // --- Stato ---
  const stato = esistenti.get('Stato')
  if (!stato?.choice) throw new Error('Colonna Stato non trovata o non è una scelta')
  const scelte = stato.choice.choices ?? []
  console.log(`\nStato, scelte attuali: ${scelte.join(' · ')}`)
  if (scelte.includes(NUOVO_STATO)) {
    console.log(`  ✓ "${NUOVO_STATO}" c'è già`)
  } else {
    // Messa dopo "Aperta", così nei menu di SharePoint l'ordine segue il flusso.
    const i = scelte.indexOf('Aperta')
    const nuove = i >= 0 ? [...scelte.slice(0, i + 1), NUOVO_STATO, ...scelte.slice(i + 1)] : [...scelte, NUOVO_STATO]
    if (!APPLY) {
      console.log(`  + "${NUOVO_STATO}" da aggiungere → ${nuove.join(' · ')}`)
    } else {
      await graph(token, 'PATCH', `/sites/${site}/lists/${lista}/columns/${stato.id}`, {
        choice: { ...stato.choice, choices: nuove },
      })
      console.log(`  + "${NUOVO_STATO}" aggiunta → ${nuove.join(' · ')}`)
    }
  }

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
