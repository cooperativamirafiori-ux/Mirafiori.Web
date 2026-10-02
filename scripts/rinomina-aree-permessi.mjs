#!/usr/bin/env node
/**
 * Riscrive nella lista SharePoint "Autorizzazioni" le aree che hanno cambiato
 * nome. Oggi: "IT e Dispositivi" → "Beni e IT" (2 ott 2026).
 *
 * Non è urgente: l'app traduce già in lettura i nomi vecchi (AREE_RINOMINATE in
 * lib/core/permessi.ts), quindi nessuno perde l'accesso nel frattempo. Serve a
 * tenere la lista pulita e a far vedere il nome giusto anche su SharePoint.
 *
 * Uso (dalla cartella web/):
 *   node scripts/rinomina-aree-permessi.mjs            ← mostra cosa cambierebbe
 *   node scripts/rinomina-aree-permessi.mjs --applica  ← scrive
 *
 * Idempotente. Se un utente ha già la riga col nome nuovo, la vecchia si
 * cancella invece di diventare un doppione.
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_AUTORIZZAZIONI.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RINOMINATE = { 'IT e Dispositivi': 'Beni e IT' }

const __dirname = dirname(fileURLToPath(import.meta.url))
const applica = process.argv.includes('--applica')

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
  const res = await fetch(path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`, {
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
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_AUTORIZZAZIONI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const base = `/sites/${process.env.SHAREPOINT_SITE_ID}/lists/${process.env.SP_LIST_AUTORIZZAZIONI}/items`
  const token = await getToken()

  const righe = []
  let url = `${base}?$expand=fields($select=Utente,Area)&$top=500`
  while (url) {
    const r = await graph(token, 'GET', url)
    righe.push(...(r.value || []))
    url = r['@odata.nextLink']
  }

  const chiave = (u, a) => `${String(u).toLowerCase()}|${a}`
  const esistenti = new Set(righe.map((r) => chiave(r.fields?.Utente, r.fields?.Area)))
  let fatte = 0

  for (const r of righe) {
    const vecchio = r.fields?.Area
    const nuovo = RINOMINATE[vecchio]
    if (!nuovo) continue
    const utente = r.fields?.Utente
    const doppione = esistenti.has(chiave(utente, nuovo))
    console.log(`${doppione ? '− cancella' : '✎ rinomina'}  ${utente}: "${vecchio}" → "${nuovo}"`)
    if (!applica) continue
    if (doppione) await graph(token, 'DELETE', `${base}/${r.id}`)
    else {
      await graph(token, 'PATCH', `${base}/${r.id}/fields`, { Area: nuovo })
      esistenti.add(chiave(utente, nuovo))
    }
    fatte++
  }

  if (!applica) console.log('\nProva a vuoto. Per scrivere: node scripts/rinomina-aree-permessi.mjs --applica')
  else console.log(`\n✓ Righe sistemate: ${fatte}`)
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
