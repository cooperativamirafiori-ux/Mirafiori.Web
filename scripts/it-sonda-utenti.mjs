#!/usr/bin/env node
/**
 * Sonda: come si risolve un campo persona di SharePoint con un token app-only?
 *
 * Il problema. Nelle liste dell'IT su `gruppo_it` l'utente è un campo persona.
 * Via Graph arriva solo `UtenteLookupId`, un numero che ha senso soltanto dentro
 * l'"elenco informazioni utente" di quel sito — che è **nascosto**, e
 * `GET /sites/{id}/lists` non lo elenca. Da qui, assegnazioni senza nome.
 *
 * Questo script prova le vie possibili e dice quale funziona, senza scrivere
 * niente. Serve una volta: poi la strada buona finisce nello script che ripara.
 *
 * Uso (dalla cartella web/):
 *   node scripts/it-sonda-utenti.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SITO_IT = process.argv.find((a) => a.startsWith('--sito='))?.slice(7) ?? 'gruppo_it'

/** GUID dell'elenco informazioni utente sul sito principale (lib/core/sp.ts). */
const UIL_SITO_PRINCIPALE = '3f6b4698-931e-4540-a681-d6a436b26bdb'

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* env già impostate */ }
}

let TOKEN = null
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

/** GET che non lancia: ritorna { ok, stato, dati|errore }. */
async function prova(etichetta, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
  })
  const t = await res.text()
  const esito = res.ok ? '✓' : '✗'
  console.log(`\n${esito} ${etichetta}`)
  console.log(`   ${path.slice(0, 130)}`)
  if (!res.ok) {
    console.log(`   ${res.status}: ${t.slice(0, 180)}`)
    return null
  }
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  TOKEN = await getToken()

  const host = (process.env.SHAREPOINT_SITE_URL || '').replace(/^https?:\/\//, '').split('/')[0]
    || 'coopmirafiorionlus.sharepoint.com'
  const sito = await (await fetch(
    `https://graph.microsoft.com/v1.0/sites/${host}:/sites/${SITO_IT}?$select=id,webUrl`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  )).json()
  console.log(`Sito: ${sito.webUrl}\n  id: ${sito.id}`)

  // Serve un lookup vero su cui provare: il primo delle assegnazioni.
  const liste = (await (await fetch(
    `https://graph.microsoft.com/v1.0/sites/${sito.id}/lists?$select=id,displayName&$top=200`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  )).json()).value || []
  const asg = liste.find((l) => l.displayName === 'Assegnazioni_DISPOSITIVI')
  if (!asg) throw new Error('Lista Assegnazioni_DISPOSITIVI non trovata')

  const campione = await prova(
    'A · il campo persona chiesto per nome, non con $expand=fields secco',
    `/sites/${sito.id}/lists/${asg.id}/items?$expand=fields($select=Utente,UtenteLookupId,Title)&$top=5`,
  )
  if (campione?.value?.length) {
    for (const i of campione.value) console.log(`   riga ${i.id}: ${JSON.stringify(i.fields)}`)
  }

  const perId = await prova(
    'B · il singolo item chiesto per id (a volte espande più cose della collezione)',
    `/sites/${sito.id}/lists/${asg.id}/items/${campione?.value?.[0]?.id ?? '3'}?$expand=fields`,
  )
  if (perId?.fields) {
    const persona = Object.entries(perId.fields).filter(([k]) => /utente/i.test(k))
    console.log(`   campi che parlano di utente: ${JSON.stringify(persona)}`)
  }

  await prova(
    'C · elenco informazioni utente per titolo',
    `/sites/${sito.id}/lists/User%20Information%20List/items?$expand=fields($select=Title,EMail,UserName)&$top=5`,
  )

  await prova(
    'D · elenco informazioni utente col GUID del sito principale',
    `/sites/${sito.id}/lists/${UIL_SITO_PRINCIPALE}/items?$expand=fields($select=Title,EMail,UserName)&$top=5`,
  )

  const tutte = await prova(
    'E · tutte le liste senza $select (per vedere se compaiono le nascoste)',
    `/sites/${sito.id}/lists?$top=200`,
  )
  if (tutte?.value) {
    console.log(`   ${tutte.value.length} liste: ${tutte.value.map((l) => `${l.displayName}${l.list?.hidden ? ' (nascosta)' : ''}`).join(', ')}`)
  }

  await prova(
    'F · la sottocartella _catalogs/users come lista',
    `/sites/${sito.id}/lists/users/items?$top=3`,
  )

  console.log('\n' + '='.repeat(70))
  console.log('Se ha funzionato A o B: il nome della persona sta già nelle assegnazioni,')
  console.log('e la riparazione non ha bisogno dell’elenco utenti.')
  console.log('Se ha funzionato C o D: l’elenco utenti è raggiungibile, basta indirizzarlo.')
  console.log('Se non ha funzionato niente: si passa dall’autenticazione delegata,')
  console.log('come già fa l’area Risorse Umane (lib/core/graph-delegato.ts).')
  console.log('='.repeat(70) + '\n')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
