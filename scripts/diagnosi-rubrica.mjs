#!/usr/bin/env node
/**
 * Verifica che la rubrica aziendale sia leggibile, prima di aprire la pagina.
 *
 * Serve perché il modo in cui questa cosa fallisce è insidioso: senza il
 * permesso `User.Read.All` Graph non risponde 403 — risponde 200 con i campi
 * omessi (trappola documentata in lib/risorse-umane/gruppo.ts). Un elenco
 * vuoto, quindi, non distingue "nessun account" da "non sei autorizzato a
 * vederli": questo script lo distingue guardando quanti utenti tornano *prima*
 * del filtro sull'email.
 *
 * Uso (da web/):
 *   node scripts/diagnosi-rubrica.mjs
 *
 * Sola lettura. Legge GRAPH_* da .env.local.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOMINIO = 'cooperativamirafiori.com'

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* env già impostate */ }
}

async function token() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.GRAPH_CLIENT_ID,
        client_secret: process.env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  )
  if (!res.ok) throw new Error(`token: ${await res.text()}`)
  return (await res.json()).access_token
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  const t = await token()
  const ruoli = JSON.parse(
    Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(),
  ).roles ?? []

  console.log(`\nPermesso User.Read.All nel token: ${ruoli.includes('User.Read.All') ? 'SÌ' : 'NO'}`)
  if (!ruoli.includes('User.Read.All')) {
    console.log('  → senza questo la rubrica torna vuota e la pagina permessi')
    console.log('    ricade sull’inserimento manuale dell’email.')
  }

  const res = await fetch(
    'https://graph.microsoft.com/v1.0/users?$select=displayName,mail,userPrincipalName,accountEnabled&$top=999',
    { headers: { Authorization: `Bearer ${t}` } },
  )
  if (!res.ok) throw new Error(`users: ${res.status} ${await res.text()}`)
  const { value } = await res.json()

  const attivi = value.filter((u) => u.accountEnabled !== false)
  const inDominio = attivi.filter((u) =>
    (u.mail ?? u.userPrincipalName ?? '').toLowerCase().endsWith(`@${DOMINIO}`),
  )
  const senzaEmail = attivi.filter((u) => !u.mail && !u.userPrincipalName)

  console.log(`\nAccount restituiti da Graph: ${value.length}`)
  console.log(`  attivi:              ${attivi.length}`)
  console.log(`  su @${DOMINIO}: ${inDominio.length}`)
  if (senzaEmail.length) {
    console.log(`  ⚠️  senza email né UPN: ${senzaEmail.length} — sintomo del permesso mancante`)
  }

  console.log('\nPrimi dieci in rubrica:')
  for (const u of inDominio.slice(0, 10)) {
    console.log(`  ${(u.displayName ?? '—').padEnd(30)} ${(u.mail ?? u.userPrincipalName).toLowerCase()}`)
  }
  console.log('')
}

main().catch((e) => {
  console.error('\n✗', e.message, '\n')
  process.exit(1)
})
