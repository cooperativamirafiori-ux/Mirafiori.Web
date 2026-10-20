#!/usr/bin/env node
/**
 * "Utente SP non trovato: <mail>" — perché la persona non è nella
 * User Information List del sito (ci entra solo dopo aver avuto un accesso al sito).
 *
 * Uso (da web/):
 *   node scripts/diagnosi-utente-sp.mjs <mail>            sola lettura
 *   node scripts/diagnosi-utente-sp.mjs <mail> --registra registra la persona sul sito
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UIL = '3f6b4698-931e-4540-a681-d6a436b26bdb'
const G = 'https://graph.microsoft.com/v1.0'

function loadEnvLocal() {
  const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
async function token() {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.GRAPH_CLIENT_ID,
      client_secret: process.env.GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) throw new Error(`token: ${await res.text()}`)
  return (await res.json()).access_token
}

loadEnvLocal()
const email = (process.argv[2] || '').trim()
if (!email) { console.error('Uso: node scripts/diagnosi-utente-sp.mjs <mail> [--registra]'); process.exit(1) }
const registra = process.argv.includes('--registra')
const tk = await token()
const H = { Authorization: `Bearer ${tk}`, Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }
const get = async (p) => { const r = await fetch(G + p, { headers: H }); return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) } }
const SITE = process.env.SHAREPOINT_SITE_ID

const u = await get(`/users/${encodeURIComponent(email)}?$select=id,displayName,mail,userPrincipalName,accountEnabled`)
console.log('1) Account Microsoft:', u.ok ? `${u.j.displayName} · mail=${u.j.mail} · upn=${u.j.userPrincipalName} · attivo=${u.j.accountEnabled}` : `NON TROVATO (${u.status})`)

async function cercaUIL() {
  const f = encodeURIComponent(`fields/EMail eq '${email}'`)
  return get(`/sites/${SITE}/lists/${UIL}/items?$select=id,fields&$expand=fields($select=id,EMail,Title,UserName)&$filter=${f}&$top=5`)
}
let r = await cercaUIL()
console.log('2) Nella User Information List del sito:', r.j.value?.length ? r.j.value.map((i) => `id=${i.fields.id} ${i.fields.Title}`).join(', ') : 'NO')

if (!r.j.value?.length) {
  const nome = (email.split('@')[0] || '').split('.').pop()
  const all = await get(`/sites/${SITE}/lists/${UIL}/items?$select=id,fields&$expand=fields($select=id,EMail,Title,UserName)&$top=999`)
  const simili = (all.j.value || []).filter((i) => JSON.stringify(i.fields).toLowerCase().includes(nome.toLowerCase()))
  console.log(`   voci simili a "${nome}":`, simili.length ? simili.map((i) => `id=${i.fields.id} ${i.fields.Title} <${i.fields.EMail}> ${i.fields.UserName ?? ''}`).join(' | ') : 'nessuna')
}

if (registra && !r.j.value?.length) {
  // stessa cartella usata dall'app (lib/core/sp.ts → registraSulSito)
  const CART = '_registrazione-utenti-app'
  let c = await get(`/sites/${SITE}/drive/root:/${CART}`)
  if (!c.ok) {
    const cr = await fetch(`${G}/sites/${SITE}/drive/root/children`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: CART, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    })
    c = { ok: cr.ok, j: await cr.json() }
    console.log('3a) Cartella di registrazione creata:', cr.status)
  }
  const inv = await fetch(`${G}/sites/${SITE}/drive/items/${c.j.id}/invite`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients: [{ email }], roles: ['read'], requireSignIn: true, sendInvitation: false }),
  })
  console.log('3) Registrazione (invito sola lettura, senza mail):', inv.status, inv.ok ? 'ok' : await inv.text())
  for (const ms of [1000, 2000, 3000]) {
    await new Promise((s) => setTimeout(s, ms))
    r = await cercaUIL()
    if (r.j.value?.length) break
  }
  console.log('4) Ora nella User Information List:', r.j.value?.length ? `SÌ, id=${r.j.value[0].fields.id}` : 'ancora NO')
}
