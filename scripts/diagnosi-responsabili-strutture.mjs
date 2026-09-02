#!/usr/bin/env node
/**
 * Diagnosi: dove stanno i responsabili delle strutture?
 *
 * Serve a capire perché `seed-permessi-manutenzioni.mjs` non trova nessuno.
 * Stampa, per la lista SP "Strutture":
 *   1. tutte le colonne (nome interno, etichetta, tipo)
 *   2. per ogni riga, i campi valorizzati che sembrano una persona o un'email
 *
 * Sola lettura: non scrive niente.
 *
 * Uso (dalla cartella web/):
 *   node scripts/diagnosi-responsabili-strutture.mjs
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
  } catch {
    // .env.local assente
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

async function graph(token, path, extraHeaders = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

function tipoColonna(c) {
  for (const t of [
    'text',
    'choice',
    'lookup',
    'personOrGroup',
    'number',
    'dateTime',
    'boolean',
    'currency',
    'hyperlinkOrPicture',
    'calculated',
  ]) {
    if (c[t]) return t
  }
  return '?'
}

async function main() {
  loadEnvLocal()
  for (const k of [
    'GRAPH_TENANT_ID',
    'GRAPH_CLIENT_ID',
    'GRAPH_CLIENT_SECRET',
    'SHAREPOINT_SITE_ID',
    'SP_LIST_STRUTTURE',
  ]) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const list = process.env.SP_LIST_STRUTTURE
  const token = await getToken()

  console.log('\n=== COLONNE DELLA LISTA STRUTTURE ===\n')
  const cols = await graph(
    token,
    `/sites/${site}/lists/${list}/columns?$select=name,displayName,text,choice,lookup,personOrGroup,number,dateTime,boolean,currency,hyperlinkOrPicture,calculated&$top=200`,
  )
  for (const c of cols.value || []) {
    if (c.name?.startsWith('_') || c.name === 'ContentType') continue
    console.log(`  ${c.name.padEnd(28)} ${tipoColonna(c).padEnd(14)} «${c.displayName}»`)
  }

  console.log('\n=== CAMPI VALORIZZATI, RIGA PER RIGA ===')
  console.log('(mostro solo ciò che somiglia a una persona: email, nome, oggetti persona)\n')
  const items = await graph(
    token,
    `/sites/${site}/lists/${list}/items?$expand=fields&$top=500`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
  )
  for (const item of items.value || []) {
    const f = item.fields || {}
    const etichetta = f.Codice ? `${f.Codice} — ${f.Title ?? ''}`.trim() : (f.Title ?? `#${item.id}`)
    const righe = []
    for (const [k, v] of Object.entries(f)) {
      if (k.startsWith('@') || k.startsWith('_') || v == null || v === '') continue
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
      const sembraPersona =
        s.includes('@') ||
        /responsab|referen|person|lookupid/i.test(k) ||
        (typeof v === 'object' && (v.Email || v.LookupValue || v.DisplayName))
      if (sembraPersona) righe.push(`      ${k} = ${s}`)
    }
    console.log(`  ${etichetta}`)
    console.log(righe.length ? righe.join('\n') : '      (nessun campo persona valorizzato)')
  }

  console.log('\nFine. Se le colonne Responsabile esistono ma sono vuote, i responsabili')
  console.log('stanno altrove (o non sono mai stati inseriti): in quel caso il permesso')
  console.log('si assegna a mano dal pannello Amministrazione › Permessi.\n')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
