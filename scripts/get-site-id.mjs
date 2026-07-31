#!/usr/bin/env node
/**
 * Risolve site id e drive id di un sito SharePoint partendo dalla sua URL,
 * e stampa le righe pronte da incollare in .env.local / Vercel.
 *
 * Serve al passo 3 del piano RU (docs/piano-ru-sito-dedicato-accesso-delegato.md):
 * appena il sito "RisorseUmane" esiste, da qui si ricavano SP_SITE_RU e SP_RU_DRIVE_ID.
 *
 * Uso (dalla cartella web/):
 *   node scripts/get-site-id.mjs https://coopmirafiorionlus.sharepoint.com/sites/RisorseUmane
 *   node scripts/get-site-id.mjs RisorseUmane          # scorciatoia: solo il nome del sito
 *
 * Identità applicativa (Sites.ReadWrite.All già presente): richiede in .env.local
 * GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

async function graph(token, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${t}`)
  return t ? JSON.parse(t) : {}
}

/** Da URL o nome sito ricava "host:/sites/nome" nel formato accettato da Graph. */
function percorsoGraph(arg, hostDefault) {
  if (/^https?:\/\//i.test(arg)) {
    const u = new URL(arg)
    return `${u.hostname}:${u.pathname.replace(/\/$/, '')}`
  }
  if (arg.includes('/')) return arg.replace(/^\/+/, `${hostDefault}:/`)
  return `${hostDefault}:/sites/${arg}`
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  const arg = process.argv[2]
  if (!arg) {
    console.error('Uso: node scripts/get-site-id.mjs <url-del-sito | nome-sito>')
    process.exit(1)
  }

  // host di default: quello del sito principale già configurato
  const hostDefault = (process.env.SHAREPOINT_SITE_URL || 'https://x.sharepoint.com')
    .replace(/^https?:\/\//, '')
    .split('/')[0]

  const path = percorsoGraph(arg, hostDefault)
  console.log(`→ Risolvo /sites/${path}`)

  const token = await getToken()
  const site = await graph(token, `/sites/${path}?$select=id,displayName,webUrl`)
  console.log(`  ✓ ${site.displayName} — ${site.webUrl}`)

  let driveId = null
  let driveName = null
  try {
    const drive = await graph(token, `/sites/${site.id}/drive?$select=id,name`)
    driveId = drive.id
    driveName = drive.name
    console.log(`  ✓ raccolta documenti predefinita: "${driveName}"`)
  } catch (e) {
    console.log(`  ⚠ raccolta documenti non risolta: ${e.message}`)
  }

  console.log('\n============================================================')
  console.log('Righe per .env.local:\n')
  console.log(`  SP_SITE_RU=${site.id}`)
  if (driveId) console.log(`  SP_RU_DRIVE_ID=${driveId}`)
  console.log(`  SP_RU_FOLDER=Risorse Umane App/Dipendenti   # percorso dentro "${driveName ?? 'raccolta predefinita'}"`)
  console.log('\nComandi Vercel (uno per ambiente):\n')
  const righe = [['SP_SITE_RU', site.id]]
  if (driveId) righe.push(['SP_RU_DRIVE_ID', driveId])
  for (const [k, v] of righe) {
    for (const amb of ['production', 'preview', 'development']) {
      console.log(`  printf '%s' "${v}" | vercel env add ${k} ${amb}`)
    }
  }
  console.log('============================================================')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
