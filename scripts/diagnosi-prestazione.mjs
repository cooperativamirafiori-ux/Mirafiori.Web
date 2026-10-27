#!/usr/bin/env node
/**
 * "Il prestatore non ha ricevuto i documenti da firmare": da dove si parte.
 *
 * Legge la pratica su SharePoint e la busta su DocuSign e dice:
 *  - che email è salvata, e se il dominio riceve posta (record MX);
 *  - stato della busta e del destinatario: "sent" = spedita ma mai aperta,
 *    "delivered" = aperta, "autoresponded" = la mail è TORNATA INDIETRO
 *    (indirizzo inesistente o casella piena), "completed" = firmata;
 *  - se DocuSign è l'ambiente DEMO (le mail partono, ma sono di prova).
 *
 * Solo lettura: non cambia niente. Uso (da web/):
 *   node scripts/diagnosi-prestazione.mjs PREST-2026-012
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createSign } from 'node:crypto'
import { resolveMx } from 'node:dns/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  for (const riga of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(riga)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}
const E = process.env

const id = (process.argv[2] || '').trim().toUpperCase()
if (!/^PREST-\d{4}-\d{3,}$/.test(id)) {
  console.error('Uso: node scripts/diagnosi-prestazione.mjs PREST-AAAA-NNN')
  process.exit(1)
}

// --- SharePoint ---
const tok = await fetch(`https://login.microsoftonline.com/${E.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: E.GRAPH_CLIENT_ID, client_secret: E.GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
}).then((r) => r.json())
const filtro = encodeURIComponent(`fields/Title eq '${id}'`)
const res = await fetch(
  `https://graph.microsoft.com/v1.0/sites/${E.SHAREPOINT_SITE_ID}/lists/${E.SP_LIST_PRESTAZIONI}/items?$expand=fields($select=Title,Nome,Cognome,Email,Stato,ResponsabileNome,ResponsabileEmail,DocusignEnvelopeId)&$filter=${filtro}&$top=2`,
  { headers: { Authorization: `Bearer ${tok.access_token}`, Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } },
).then((r) => r.json())
const f = res.value?.[0]?.fields
if (!f) {
  console.error(`✗ Pratica ${id} non trovata.`)
  process.exit(1)
}
console.log(`\n${id} — ${f.Cognome} ${f.Nome}`)
console.log(`  stato:        ${f.Stato}`)
console.log(`  responsabile: ${f.ResponsabileNome} <${f.ResponsabileEmail}>`)
console.log(`  email salvata: "${f.Email}"`)

const email = (f.Email || '').trim()
const dominio = email.split('@')[1]
if (!dominio) {
  console.log('  ✗ email senza dominio')
} else {
  try {
    const mx = await resolveMx(dominio)
    console.log(mx.length ? `  ✓ il dominio ${dominio} riceve posta` : `  ✗ il dominio ${dominio} NON riceve posta`)
  } catch {
    console.log(`  ✗ il dominio ${dominio} NON esiste o non riceve posta (refuso?)`)
  }
}
if (email !== f.Email) console.log('  ! l’email ha spazi prima o dopo')

// Indirizzo della cooperativa: si può verificare che la casella esista davvero
if (dominio && dominio.toLowerCase() === 'cooperativamirafiori.com') {
  const u = await fetch(
    `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(`mail eq '${email}' or proxyAddresses/any(x:x eq 'smtp:${email}')`)}&$select=displayName,mail&$count=true`,
    { headers: { Authorization: `Bearer ${tok.access_token}`, ConsistencyLevel: 'eventual' } },
  ).then((r) => r.json())
  if (u.value?.length) {
    console.log(`  ✓ la casella esiste: ${u.value[0].displayName} <${u.value[0].mail}>`)
  } else {
    console.log('  ✗ NESSUNA casella con questo indirizzo nella cooperativa: la mail torna indietro')
    const nome = (f.Nome || '').split(' ')[0]
    const simili = await fetch(
      `https://graph.microsoft.com/v1.0/users?$search=${encodeURIComponent(`"displayName:${f.Cognome}"`)}&$select=displayName,mail&$top=5`,
      { headers: { Authorization: `Bearer ${tok.access_token}`, ConsistencyLevel: 'eventual' } },
    ).then((r) => r.json())
    for (const x of simili.value ?? []) console.log(`    forse: ${x.displayName} <${x.mail}>`)
    if (!simili.value?.length && nome) console.log(`    nessun account con cognome "${f.Cognome}"`)
  }
}

// --- DocuSign ---
if (!f.DocusignEnvelopeId) {
  console.log('\nNessuna busta DocuSign su questa pratica (documenti non ancora inviati in firma).')
  process.exit(0)
}
const b64u = (x) => Buffer.from(x).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
function pem() {
  let raw = (E.DOCUSIGN_PRIVATE_KEY_BASE64 || '').trim()
  if (!raw.includes('-----BEGIN')) raw = Buffer.from(raw, 'base64').toString('utf8')
  raw = raw.replace(/\\n/g, '\n').trim()
  const m = raw.match(/-----BEGIN ([A-Z0-9 ]+?)-----([\s\S]*?)-----END \1-----/)
  if (!m) return raw
  const corpo = m[2].replace(/[^A-Za-z0-9+/=]/g, '').match(/.{1,64}/g).join('\n')
  return `-----BEGIN ${m[1]}-----\n${corpo}\n-----END ${m[1]}-----\n`
}
const ora = Math.floor(Date.now() / 1000)
const ingresso = `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ iss: E.DOCUSIGN_INTEGRATION_KEY, sub: E.DOCUSIGN_USER_ID, aud: E.DOCUSIGN_OAUTH_HOST, iat: ora, exp: ora + 3600, scope: 'signature impersonation' }))}`
const firma = createSign('RSA-SHA256').update(ingresso).sign(pem())
const t = await fetch(`https://${E.DOCUSIGN_OAUTH_HOST}/oauth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${ingresso}.${b64u(firma)}` }),
}).then((r) => r.json())
if (!t.access_token) {
  console.error('✗ DocuSign non risponde con le credenziali di .env.local:', JSON.stringify(t).slice(0, 200))
  process.exit(1)
}
const base = `${E.DOCUSIGN_BASE_PATH.replace(/\/$/, '')}/v2.1/accounts/${E.DOCUSIGN_ACCOUNT_ID}/envelopes/${f.DocusignEnvelopeId}`
const h = { Authorization: `Bearer ${t.access_token}` }
const busta = await fetch(base, { headers: h }).then((r) => r.json())
const dest = await fetch(`${base}/recipients`, { headers: h }).then((r) => r.json())

console.log(`\nDocuSign ${E.DOCUSIGN_BASE_PATH.includes('demo') ? '(ambiente DEMO — di prova)' : '(produzione)'}`)
if (busta.errorCode) {
  console.log(`  ✗ busta non trovata: ${busta.errorCode} — probabilmente è stata creata in un altro ambiente/account`)
  process.exit(0)
}
console.log(`  busta: ${busta.status} — inviata il ${busta.sentDateTime ?? '?'}`)
const SPIEGA = {
  sent: 'spedita, ma il destinatario non l’ha mai aperta',
  delivered: 'aperta dal destinatario, non ancora firmata',
  completed: 'firmata',
  declined: 'rifiutata dal destinatario',
  autoresponded: 'MAIL TORNATA INDIETRO: indirizzo inesistente o casella piena',
  created: 'bozza, non spedita',
}
for (const s of dest.signers ?? []) {
  console.log(`  destinatario: ${s.email} — ${s.status} (${SPIEGA[s.status] ?? s.status})`)
  if (s.email.toLowerCase() !== email.toLowerCase()) console.log('  ! l’email nella busta è diversa da quella sulla pratica')
}
