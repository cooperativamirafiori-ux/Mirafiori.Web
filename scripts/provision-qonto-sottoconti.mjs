#!/usr/bin/env node
/**
 * Crea su Qonto un sottoconto per ogni centro di costo attivo.
 *
 * Il sottoconto è la "cassa" del servizio: il saldo è la liquidità che il
 * responsabile ha ancora da spendere, e le carte legate a quel sottoconto
 * vengono rifiutate dalla banca quando è vuoto. Il limite lo fa rispettare
 * Qonto, non un cruscotto.
 *
 * Nome del sottoconto = "<codice> · <nome CC>", per esempio "cc9 · CRP CO.S.MI.C.A".
 * Il codice all'inizio è la chiave che l'app usa per agganciare il sottoconto
 * al centro di costo: il nome dopo il " · " si può cambiare a mano su Qonto
 * senza rompere niente, il codice no.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-qonto-sottoconti.mjs                  # mostra cosa farebbe
 *   node scripts/provision-qonto-sottoconti.mjs --apply          # crea
 *   node scripts/provision-qonto-sottoconti.mjs --salta cc2,cc23 # esclude dei CC
 *
 * Idempotente: un sottoconto il cui nome inizia già con "<codice> ·" non si ricrea.
 * NON chiude e NON rinomina niente.
 *
 * Richiede in .env.local (o nell'ambiente):
 *   QONTO_LOGIN, QONTO_SECRET        (chiave API generata da un owner/admin)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (legge lo specchio centro_di_costo)
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const iSalta = process.argv.indexOf('--salta')
const SALTA = new Set(
  iSalta > -1 ? (process.argv[iSalta + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : [],
)
const QONTO = 'https://thirdparty.qonto.com/v2'
const SEP = ' · '

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // .env.local assente: si presume env già impostate
  }
}

async function qonto(method, path, body) {
  const headers = {
    Authorization: `${process.env.QONTO_LOGIN}:${process.env.QONTO_SECRET}`,
    Accept: 'application/json',
  }
  if (body) {
    headers['Content-Type'] = 'application/json'
    headers['X-Qonto-Idempotency-Key'] = randomUUID()
  }
  const res = await fetch(QONTO + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const txt = await res.text()
  if (!res.ok) throw new Error(`Qonto ${method} ${path} → ${res.status}: ${txt}`)
  return txt ? JSON.parse(txt) : null
}

async function centriDiCosto() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/centro_di_costo?select=codice,nome,ordine,attivo&attivo=eq.true&order=ordine`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
  )
  if (!res.ok) throw new Error(`Supabase centro_di_costo → ${res.status}: ${await res.text()}`)
  return (await res.json()).filter((c) => /^cc\d+$/.test(c.codice))
}

async function main() {
  loadEnvLocal()
  for (const k of ['QONTO_LOGIN', 'QONTO_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[k]) throw new Error(`Manca ${k} in .env.local`)
  }

  const [cc, conti] = await Promise.all([centriDiCosto(), qonto('GET', '/bank_accounts?per_page=100')])
  const esistenti = conti.bank_accounts || []
  const perCodice = new Map()
  for (const a of esistenti) {
    const m = (a.name || '').match(/^(cc\d+)\s·/)
    if (m) perCodice.set(m[1], a)
  }

  console.log(`Conti già su Qonto: ${esistenti.length}`)
  for (const a of esistenti) console.log(`  ${a.main ? '★' : ' '} ${a.name}  ${a.iban || ''}`)
  console.log(`\nCentri di costo attivi: ${cc.length}${SALTA.size ? ` (esclusi: ${[...SALTA].join(', ')})` : ''}\n`)

  const daCreare = []
  for (const c of cc) {
    const nome = `${c.codice}${SEP}${c.nome}`
    if (SALTA.has(c.codice)) console.log(`  salto   ${nome}`)
    else if (perCodice.has(c.codice)) console.log(`  c'è già ${perCodice.get(c.codice).name}`)
    else {
      console.log(`  CREO    ${nome}`)
      daCreare.push(nome)
    }
  }

  if (!daCreare.length) return console.log('\nNiente da creare.')
  if (!APPLY) return console.log(`\n${daCreare.length} sottoconti da creare. Rilancia con --apply per crearli.`)

  for (const nome of daCreare) {
    const r = await qonto('POST', '/bank_accounts', { bank_account: { name: nome } })
    const a = r.bank_account || r
    console.log(`  ✓ ${nome}  ${a.iban || ''}`)
  }
  console.log(`\nCreati ${daCreare.length} sottoconti.`)
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
