#!/usr/bin/env node
/**
 * Mostra i permessi applicativi che l'app ha DAVVERO in questo momento.
 *
 * Guarda dentro al token: il claim `roles` di un access token appena rilasciato
 * è esattamente ciò che Graph legge quando decide se rispondere 403. È la sola
 * verifica che non lascia margine di interpretazione — un permesso "aggiunto e
 * consentito" nel portale può non essere ancora nel token, e in quel caso
 * l'unica cosa da fare è aspettare.
 *
 * Uso (da web/):
 *   node scripts/diagnosi-permessi.mjs
 *
 * Sola lettura. Legge GRAPH_* da .env.local.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** I permessi che l'area Risorse Umane si aspetta di trovare. */
const ATTESI = [
  ['Sites.ReadWrite.All', 'scrittura app-only su SharePoint (tutti i moduli)'],
  ['GroupMember.Read.All', 'chi è nel gruppo M365 Risorse Umane'],
  ['User.Read.All', 'email e UPN dei membri del gruppo'],
]

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* env già impostate */ }
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.GRAPH_CLIENT_ID,
        client_secret: process.env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  )
  if (!res.ok) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const { access_token: token } = await res.json()

  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  const ruoli = (payload.roles ?? []).sort()

  console.log('\n' + '='.repeat(66))
  console.log('PERMESSI APPLICATIVI NEL TOKEN RILASCIATO ADESSO')
  console.log('='.repeat(66))
  console.log(`  app:      ${payload.appid ?? payload.azp ?? '—'}`)
  console.log(`  rilascio: ${new Date(payload.iat * 1000).toISOString().slice(0, 19).replace('T', ' ')}`)

  console.log(`\n  ${ruoli.length} permessi presenti:`)
  for (const r of ruoli) console.log(`    ${r}`)

  console.log('\n  Quelli che servono all’area Risorse Umane:')
  let mancano = 0
  for (const [nome, aCosaServe] of ATTESI) {
    const c = ruoli.includes(nome)
    if (!c) mancano++
    console.log(`    ${c ? '\x1b[32m✓' : '\x1b[31m✗'} ${nome.padEnd(22)}\x1b[0m ${aCosaServe}`)
  }

  console.log('\n' + '='.repeat(66))
  if (mancano === 0) {
    console.log('Tutto a posto: rilancia  node scripts/diagnosi-gruppo-ru.mjs')
  } else {
    console.log(`Mancano ${mancano} permessi nel token.`)
    console.log('')
    console.log('Se li hai già aggiunti e consentiti, è propagazione: Entra può metterci')
    console.log('qualche minuto a includere un ruolo nuovo nei token. Riprova fra 5 minuti.')
    console.log('Se dopo 10 minuti mancano ancora, il consenso non è passato:')
    console.log('  az ad app permission admin-consent --id ' + (payload.appid ?? '<app-id>'))
  }
  console.log('')
}

main().catch((err) => { console.error(`\n✗ ERRORE: ${err.message}\n`); process.exit(1) })
