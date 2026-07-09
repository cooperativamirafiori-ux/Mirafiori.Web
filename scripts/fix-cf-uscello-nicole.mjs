#!/usr/bin/env node
/**
 * Ripristino Codice Fiscale corretto per due record Dipendenti che l'import
 * "import-quote-soci-2026.mjs" aveva sovrascritto con un CF errato del file
 * (match avvenuto per nome, non per CF).
 *
 *   USCELLO GABRIELE (id 198): l'Excel aveva "SCLGRL94RL16L219X" (17 caratteri,
 *       malformato). CF corretto = quello originale del DB "SCLGRL91R16L219X"
 *       (coerente con la nascita 16/10/1991).
 *   TEMPO NICOLE (id 12): l'Excel aveva "TMPNCL98D50L219B" (D=aprile), ma la
 *       data di nascita è 10/02/1998 (febbraio). CF corretto = "TMPNCL98B50L219B".
 *
 * Prima di scrivere legge il valore attuale e lo mostra (vecchio → nuovo).
 * Se il valore attuale è già quello corretto, salta il record.
 *
 * USO (dalla cartella web/):
 *   node scripts/fix-cf-uscello-nicole.mjs           # dry-run
 *   node scripts/fix-cf-uscello-nicole.mjs --apply    # applica
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_DIPENDENTI.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

// id SharePoint -> { atteso: CF corretto, chi: etichetta }
const CORREZIONI = [
  { id: '198', chi: 'USCELLO GABRIELE', atteso: 'SCLGRL91R16L219X' },
  { id: '12',  chi: 'TEMPO NICOLE',     atteso: 'TMPNCL98B50L219B' },
]

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
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${t}`)
  return t ? JSON.parse(t) : {}
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_DIPENDENTI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const listId = process.env.SP_LIST_DIPENDENTI
  console.log(`→ Modalità: ${APPLY ? 'APPLICA' : 'DRY-RUN (nessuna modifica)'}\n`)
  const token = await getToken()

  let cambiati = 0
  for (const c of CORREZIONI) {
    const item = await graph(token, 'GET',
      `/sites/${site}/lists/${listId}/items/${c.id}?$select=id&$expand=fields($select=Cognome,Nome,CodiceFiscale,DataNascita)`)
    const f = item.fields || {}
    const attuale = String(f.CodiceFiscale ?? '').trim()
    const nome = `${f.Cognome ?? ''} ${f.Nome ?? ''}`.trim()
    if (attuale === c.atteso) {
      console.log(`• ${nome} [id ${c.id}]: già corretto (${c.atteso}) — salto`)
      continue
    }
    cambiati++
    console.log(`• ${nome} [id ${c.id}]  nato ${String(f.DataNascita ?? '').slice(0, 10)}`)
    console.log(`    CodiceFiscale: ${attuale || '∅'} → ${c.atteso}`)
    if (APPLY) {
      await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/items/${c.id}/fields`, { CodiceFiscale: c.atteso })
    }
  }

  console.log('\n============================================================')
  console.log(`CF da correggere: ${cambiati}`)
  if (!APPLY && cambiati) console.log('Rilancia con --apply per applicare.')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
