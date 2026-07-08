#!/usr/bin/env node
/**
 * Migrazione dati Dipendenti (luglio 2026) per i record già importati.
 *
 * Fa due cose, in modo IDEMPOTENTE (rilanciabile senza danni):
 *   1) StatoRapporto: se vuoto lo imposta a "Cessato" quando esiste
 *      DataDimissioneLavoratore, altrimenti "Attivo".
 *   2) AreaAssunzione: converte i vecchi valori "Area A" -> "Tipo A",
 *      "Area B" -> "Tipo B".
 *
 * NON tocca i record già coerenti. Stampa un riepilogo.
 *
 * Uso (dalla cartella web/):
 *   node scripts/migrate-dipendenti-2026-07.mjs           # dry-run (mostra cosa farebbe)
 *   node scripts/migrate-dipendenti-2026-07.mjs --apply   # applica le modifiche
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_DIPENDENTI.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

const AREA_MAP = { 'Area A': 'Tipo A', 'Area B': 'Tipo B' }

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
  const t = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${t}`)
  return t ? JSON.parse(t) : {}
}

async function getAll(token, site, listId) {
  const out = []
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=StatoRapporto,DataDimissioneLavoratore,AreaAssunzione)&$top=200`
  while (url) {
    const res = await graph(token, 'GET', url)
    out.push(...(res.value || []))
    const next = res['@odata.nextLink']
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

async function main() {
  loadEnvLocal()
  const site = process.env.SHAREPOINT_SITE_ID
  const listId = process.env.SP_LIST_DIPENDENTI
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_DIPENDENTI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  console.log(`→ Modalità: ${APPLY ? 'APPLICA' : 'DRY-RUN (nessuna modifica)'}`)
  const token = await getToken()
  const items = await getAll(token, site, listId)
  console.log(`→ ${items.length} dipendenti da controllare`)

  let statoCount = 0
  let areaCount = 0
  for (const it of items) {
    const f = it.fields || {}
    const patch = {}

    if (!f.StatoRapporto) {
      patch.StatoRapporto = f.DataDimissioneLavoratore ? 'Cessato' : 'Attivo'
      statoCount++
    }
    if (f.AreaAssunzione && AREA_MAP[f.AreaAssunzione]) {
      patch.AreaAssunzione = AREA_MAP[f.AreaAssunzione]
      areaCount++
    }

    if (Object.keys(patch).length === 0) continue
    if (APPLY) {
      await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/items/${it.id}/fields`, patch)
    } else {
      console.log(`  #${it.id}:`, patch)
    }
  }

  console.log('\n============================================================')
  console.log(`StatoRapporto impostato: ${statoCount}`)
  console.log(`AreaAssunzione convertito Area->Tipo: ${areaCount}`)
  if (!APPLY) console.log('\nRilancia con --apply per applicare.')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
