#!/usr/bin/env node
/**
 * Diagnosi della lettura dei membri del gruppo M365 Risorse Umane.
 *
 * Serve a capire quale endpoint Graph risponde correttamente: `transitiveMembers`
 * con cast OData può rispondere 200 con `value: []` anziché con un errore, e in
 * quel caso l'app conclude — sbagliando — che nessuno è membro del gruppo.
 *
 * Uso (da web/):
 *   node scripts/diagnosi-gruppo-ru.mjs
 *   node scripts/diagnosi-gruppo-ru.mjs dennis.maseri@cooperativamirafiori.com
 *
 * Legge SP_GRUPPO_RU_ID e le credenziali GRAPH_* da .env.local. Sola lettura.
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
  if (!res.ok) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()).access_token
}

async function prova(token, etichetta, path, headers = {}, opzioni = {}) {
  process.stdout.write(`\n\x1b[1m${etichetta}\x1b[0m\n  ${path}\n`)
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method: opzioni.body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opzioni.body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: opzioni.body ? JSON.stringify(opzioni.body) : undefined,
    })
    const testo = await res.text()
    if (!res.ok) {
      console.log(`  \x1b[31m✗ HTTP ${res.status}\x1b[0m — ${testo.slice(0, 260)}`)
      return null
    }
    const dati = JSON.parse(testo)
    if (opzioni.oggettoSingolo) {
      console.log(`  \x1b[32m✓ HTTP 200\x1b[0m — ${JSON.stringify(dati).slice(0, 200)}`)
      return dati
    }
    const n = (dati.value ?? []).length
    const colore = n > 0 ? '\x1b[32m✓' : '\x1b[31m✗'
    console.log(`  ${colore} HTTP 200 — ${n} elementi\x1b[0m`)
    for (const v of (dati.value ?? []).slice(0, 4)) {
      console.log(`      ${v['@odata.type'] ?? '(senza tipo)'}  ${v.userPrincipalName ?? v.mail ?? v.displayName ?? v.id}`)
    }
    if (n > 4) console.log(`      … e altri ${n - 4}`)
    return dati.value ?? []
  } catch (e) {
    console.log(`  \x1b[31m✗ ${e.message}\x1b[0m`)
    return null
  }
}

async function main() {
  loadEnvLocal()
  const gruppo = process.env.SP_GRUPPO_RU_ID
  const email = (process.argv[2] || 'dennis.maseri@cooperativamirafiori.com').toLowerCase()

  console.log('\n' + '='.repeat(70))
  console.log('DIAGNOSI LETTURA MEMBRI GRUPPO RISORSE UMANE')
  console.log('='.repeat(70))
  console.log(`  gruppo: ${gruppo ?? '\x1b[31mSP_GRUPPO_RU_ID NON IMPOSTATA\x1b[0m'}`)
  console.log(`  cerco:  ${email}`)
  if (!gruppo) process.exit(1)

  const token = await getToken()

  // Verifica che il permesso applicativo ci sia: senza, tutto il resto dà 403.
  await prova(token, '0. il gruppo è leggibile?', `/groups/${gruppo}?$select=displayName,mail`, {}, { oggettoSingolo: true })

  const risultati = {}
  risultati.castTransitivi = await prova(
    token,
    '1. transitiveMembers con cast (quello usato oggi dall’app)',
    `/groups/${gruppo}/transitiveMembers/microsoft.graph.user?$select=userPrincipalName,mail&$top=200`,
  )
  risultati.castConConsistency = await prova(
    token,
    '2. lo stesso, con ConsistencyLevel: eventual',
    `/groups/${gruppo}/transitiveMembers/microsoft.graph.user?$select=userPrincipalName,mail&$count=true&$top=200`,
    { ConsistencyLevel: 'eventual' },
  )
  risultati.transitiviSenzaCast = await prova(
    token,
    '3. transitiveMembers senza cast',
    `/groups/${gruppo}/transitiveMembers?$select=id,userPrincipalName,mail&$top=200`,
  )
  risultati.membri = await prova(
    token,
    '4. members (diretti, senza cast)',
    `/groups/${gruppo}/members?$select=id,userPrincipalName,mail&$top=200`,
  )

  // --- le due prove decisive -------------------------------------------------
  // 5: le proprietà dell'utente sono leggibili? Se 403, manca User.Read.All e
  //    l'approccio "scarico la lista e cerco l'email" non è praticabile.
  await prova(
    token,
    '5. proprietà di un singolo utente (serve User.Read.All?)',
    `/users/${encodeURIComponent(email)}?$select=id,userPrincipalName,mail`,
    {},
    { oggettoSingolo: true },
  )

  // 6: la domanda giusta — "questa persona è nel gruppo?" — senza leggere
  //    nessuna proprietà e senza scaricare elenchi.
  await prova(
    token,
    '6. checkMemberGroups: questa persona è nel gruppo?',
    `/users/${encodeURIComponent(email)}/checkMemberGroups`,
    {},
    { body: { groupIds: [gruppo] }, oggettoSingolo: true },
  )

  console.log('\n' + '='.repeat(70))
  console.log('ESITO')
  console.log('='.repeat(70))
  for (const [nome, valore] of Object.entries(risultati)) {
    if (!valore) {
      console.log(`  ${nome.padEnd(24)} non utilizzabile`)
      continue
    }
    const trovata = valore.some(
      (v) =>
        String(v.userPrincipalName ?? '').toLowerCase() === email ||
        String(v.mail ?? '').toLowerCase() === email,
    )
    console.log(
      `  ${nome.padEnd(24)} ${String(valore.length).padStart(3)} elementi   ` +
        (trovata ? '\x1b[32memail TROVATA\x1b[0m' : '\x1b[31memail assente\x1b[0m'),
    )
  }
  console.log('\nDa usare nell’app: il primo che elenca i membri e trova l’email.\n')
}

main().catch((err) => { console.error(`\n✗ ERRORE: ${err.message}\n`); process.exit(1) })
