#!/usr/bin/env node
/**
 * Consegna il token OAuth di Qonto all'app: lo copia da web/.qonto-oauth.json
 * nella tabella Supabase `qonto_token`, e rinomina il file locale in
 * `.qonto-oauth.json.in-app` perché gli script del Mac smettano di usarlo.
 *
 * ⚠️ Perché si rinomina: il refresh token è MONOUSO. Se il Mac e l'app lo
 * usassero entrambi, il primo che rinnova lascerebbe l'altro con un token
 * morto. Dopo questo script gli script Qonto del Mac tornano alla chiave API;
 * se uno di loro dovesse servire OAuth, `qonto-oauth-login.mjs` crea un nuovo
 * accesso solo per il Mac.
 *
 * Uso (dalla cartella web/, dopo qonto-oauth-login.mjs):
 *   node scripts/qonto-oauth-a-supabase.mjs
 */

import { readFileSync, renameSync, existsSync } from 'node:fs'
import { loadEnvLocal, TOKEN_FILE } from './_qonto.mjs'

loadEnvLocal()
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERRORE: mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
if (!existsSync(TOKEN_FILE)) {
  console.error('ERRORE: manca .qonto-oauth.json — prima: node scripts/qonto-oauth-login.mjs')
  process.exit(1)
}
const t = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'))
if (!String(t.scope ?? '').includes('request_transfers.write')) {
  console.error(`ERRORE: il token non ha il permesso request_transfers.write (ha: ${t.scope}). Rifai il login.`)
  process.exit(1)
}

// Chi ha fatto il login: le richieste risulteranno a suo nome.
let chi = null
try {
  const r = await fetch('https://thirdparty.qonto.com/v2/organization', {
    headers: { Authorization: `Bearer ${t.access_token}`, Accept: 'application/json' },
  })
  if (r.ok) chi = (await r.json()).organization?.legal_name ?? null
} catch {}

const riga = {
  id: 1,
  access_token: t.access_token,
  access_scade_il: t.scade_il,
  refresh_token: t.refresh_token,
  refresh_rinnovato_il: new Date(Date.parse(t.refresh_scade_circa_il) - 90 * 86400 * 1000).toISOString(),
  scope: t.scope,
  autorizzato_da: process.argv[2] || 'Dennis Maseri',
  rinnovo_fino: null,
  aggiornato_il: new Date().toISOString(),
}
const res = await fetch(`${SUPABASE_URL}/rest/v1/qonto_token?on_conflict=id`, {
  method: 'POST',
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify(riga),
})
if (!res.ok) {
  console.error(`ERRORE Supabase ${res.status}: ${await res.text()}`)
  console.error('Il file locale NON è stato toccato.')
  process.exit(1)
}
renameSync(TOKEN_FILE, `${TOKEN_FILE}.in-app`)
console.log(`✓ Token consegnato all'app${chi ? ` (${chi})` : ''}. Permessi: ${t.scope}`)
console.log(`✓ File locale rinominato in .qonto-oauth.json.in-app: gli script del Mac usano di nuovo la chiave API.`)
