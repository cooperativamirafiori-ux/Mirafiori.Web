#!/usr/bin/env node
/**
 * Allineamento campo "Socio" dei Dipendenti (luglio 2026).
 *
 * Regola: se il dipendente ha dati in "Quota sociale sottoscritta"
 * (QuotaSociale > 0) OPPURE in "Data ammissione socio"
 * (DataAmmissioneSocio valorizzata), imposta Socio = "Si".
 *
 * Idempotente e sicuro (rilanciabile):
 *   - tocca solo i record il cui Socio non è già "Si";
 *   - non cambia mai un "Si" esistente né imposta "No".
 *
 * Uso (dalla cartella web/):
 *   node scripts/migrate-dipendenti-socio-2026-07.mjs           # dry-run (mostra cosa farebbe)
 *   node scripts/migrate-dipendenti-socio-2026-07.mjs --apply   # applica le modifiche
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_DIPENDENTI.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

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
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=Cognome,Nome,Socio,QuotaSociale,DataAmmissioneSocio)&$top=200`
  while (url) {
    const res = await graph(token, 'GET', url)
    out.push(...(res.value || []))
    const next = res['@odata.nextLink']
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

const haData = (v) => v != null && String(v).trim() !== ''
const haQuota = (v) => v != null && String(v).trim() !== '' && Number(v) > 0

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

  let cambiati = 0
  for (const it of items) {
    const f = it.fields || {}
    const nome = `${f.Cognome ?? ''} ${f.Nome ?? ''}`.trim() || `#${it.id}`

    const indizioSocio = haQuota(f.QuotaSociale) || haData(f.DataAmmissioneSocio)
    if (!indizioSocio) continue
    if (String(f.Socio ?? '').trim() === 'Si') continue

    const motivo = [
      haQuota(f.QuotaSociale) ? `quota=${f.QuotaSociale}` : null,
      haData(f.DataAmmissioneSocio) ? `ammissione=${String(f.DataAmmissioneSocio).slice(0, 10)}` : null,
    ].filter(Boolean).join(', ')

    cambiati++
    if (APPLY) {
      await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/items/${it.id}/fields`, { Socio: 'Si' })
    } else {
      console.log(`  ${nome}: Socio → "Si"  (${motivo})`)
    }
  }

  console.log('\n============================================================')
  console.log(`Socio impostato a "Si": ${cambiati}`)
  if (!APPLY) console.log('\nRilancia con --apply per applicare.')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
