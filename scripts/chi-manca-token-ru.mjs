#!/usr/bin/env node
/**
 * Chi tra i membri del gruppo M365 "Risorse Umane" NON ha (ancora) un token
 * Microsoft delegato salvato — cioè per chi l'area Dipendenti/Tirocini darà
 * "esci e rientra nell'app" (o, prima della correzione del 2026-08-07, il
 * fuorviante "lista SharePoint non configurata").
 *
 * Nato dal caso di Giorgia Tasca (7 ago 2026): i log di produzione mostrano
 * `RiautenticazioneRichiesta: Nessun token Microsoft memorizzato per questo
 * utente` per 2 persone diverse — questo script le trova entrambe senza
 * aspettare che scrivano un messaggio.
 *
 * Causa tipica: la persona non ha mai rifatto un login completo (logout +
 * login Microsoft) da quando l'area RU è passata all'accesso delegato
 * (30-31/07/2026) — sessione dell'app ancora valida da prima, quindi non è
 * mai passata dal flusso OAuth che salva il token in Supabase (vedi
 * lib/core/ms-token.ts, lib/core/auth.ts).
 *
 * Uso (da web/):
 *   node scripts/chi-manca-token-ru.mjs
 *
 * Sola lettura: legge i membri del gruppo via Graph (app) e le righe di
 * ms_token via Supabase REST (solo email, non decifra nulla).
 * Legge GRAPH_*, SP_GRUPPO_RU_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY da
 * .env.local.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    const trovate = {}
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m) trovate[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    for (const [k, v] of Object.entries(trovate)) {
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch { /* env già impostate */ }
}

async function getAppToken() {
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
  if (!res.ok) throw new Error(`token Graph ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()).access_token
}

async function membriGruppoRU(token) {
  const gruppo = process.env.SP_GRUPPO_RU_ID
  if (!gruppo) throw new Error('SP_GRUPPO_RU_ID non impostata')
  const membri = []
  let path = `https://graph.microsoft.com/v1.0/groups/${gruppo}/transitiveMembers/microsoft.graph.user?$select=displayName,userPrincipalName,mail&$top=200`
  while (path) {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error?.message || `Graph ${res.status}`)
    membri.push(...(d.value ?? []))
    path = d['@odata.nextLink'] ?? null
  }
  return membri
}

async function emailConToken() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY non impostate')
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/ms_token?select=email,expires_at`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  const testo = await res.text()
  if (!res.ok) throw new Error(`Supabase → ${res.status}: ${testo.slice(0, 300)}`)
  const righe = testo ? JSON.parse(testo) : []
  return new Map(righe.map((r) => [r.email.toLowerCase(), r.expires_at]))
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  const token = await getAppToken()
  const [membri, conToken] = await Promise.all([membriGruppoRU(token), emailConToken()])

  console.log(`\nMembri del gruppo M365 Risorse Umane: ${membri.length}`)
  console.log(`Righe in ms_token (token salvato almeno una volta): ${conToken.size}\n`)

  const senzaToken = []
  for (const m of membri) {
    const upn = (m.userPrincipalName || '').toLowerCase()
    const mail = (m.mail || '').toLowerCase()
    const ha = conToken.has(upn) || (mail && conToken.has(mail))
    if (!ha) senzaToken.push(m)
  }

  if (!senzaToken.length) {
    console.log('\x1b[32m✓ Tutti i membri del gruppo hanno un token salvato almeno una volta.\x1b[0m')
    console.log('  (Se qualcuno lamenta comunque l’errore, il token può essere scaduto/revocato')
    console.log('   dopo il salvataggio: la soluzione è comunque uscire e rientrare nell’app.)\n')
    return
  }

  console.log(`\x1b[31m✗ ${senzaToken.length} membri SENZA token salvato — vedranno "esci e rientra nell'app":\x1b[0m\n`)
  for (const m of senzaToken) {
    console.log(`  · ${m.displayName ?? '(nome ignoto)'}  —  ${m.userPrincipalName ?? m.mail ?? '(email ignota)'}`)
  }
  console.log('\nSoluzione per ciascuno: uscire completamente dall’app (logout) e rientrare,')
  console.log('completando il login Microsoft (non basta chiudere la scheda del browser).\n')
}

main().catch((err) => { console.error(`\n✗ ERRORE: ${err.message}\n`); process.exit(1) })
