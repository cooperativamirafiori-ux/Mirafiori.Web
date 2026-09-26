#!/usr/bin/env node
/**
 * Prova: la chiave API della cooperativa può creare una RICHIESTA di bonifico
 * su Qonto? E a nome di chi risulta?
 *
 * Serve prima di costruire "Invia a Qonto": la richiesta la crea l'app con la
 * chiave API, la approva Claudia nell'app Qonto. Se la chiave risultasse a
 * nome di Claudia, lei non potrebbe approvare le proprie richieste.
 *
 * Usa SEMPRE la chiave API (come farà l'app), anche se c'è .qonto-oauth.json.
 *
 * Uso (dalla cartella web/):
 *   node scripts/qonto-prova-richiesta.mjs cc18          # mostra soltanto: persone, conti, cosa creerebbe
 *   node scripts/qonto-prova-richiesta.mjs cc18 --crea   # crea davvero una richiesta di 0,01 € dal
 *                                                         # sottoconto cc18 al conto principale
 *
 * La richiesta di prova non sposta denaro finché nessuno la approva: va
 * RIFIUTATA su Qonto. (Se anche venisse approvata, è 1 centesimo fra due conti nostri.)
 */

import { randomUUID } from 'node:crypto'
import { loadEnvLocal } from './_qonto.mjs'

loadEnvLocal()
const cc = (process.argv[2] || '').toLowerCase()
const CREA = process.argv.includes('--crea')
if (!/^cc\d+$/.test(cc)) {
  console.error('Indica il centro di costo del sottoconto da cui far partire la prova, es. cc18')
  process.exit(1)
}

const auth = `${process.env.QONTO_LOGIN}:${process.env.QONTO_SECRET}`
async function chiama(metodo, p, corpo, extra = {}) {
  const r = await fetch('https://thirdparty.qonto.com/v2' + p, {
    method: metodo,
    headers: { Authorization: auth, Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...extra },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const t = await r.text()
  let j
  try { j = JSON.parse(t) } catch { j = t }
  return { ok: r.ok, status: r.status, j }
}

// 1. Le persone dell'organizzazione
const m = await chiama('GET', '/memberships?per_page=100')
const persone = new Map()
if (m.ok) {
  console.log('=== PERSONE SU QONTO ===')
  for (const p of m.j.memberships ?? []) {
    persone.set(p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim())
    console.log(`  ${`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim().padEnd(28)} ruolo: ${p.role ?? '?'}  id: ${p.id}`)
  }
} else {
  console.log(`(elenco persone non disponibile con la chiave: ${m.status})`)
}

// 2. I conti
const b = await chiama('GET', '/bank_accounts?per_page=100')
if (!b.ok) throw new Error(`bank_accounts → ${b.status}: ${JSON.stringify(b.j)}`)
const conti = b.j.bank_accounts ?? []
const da = conti.find((a) => (a.name || '').toLowerCase().startsWith(cc + ' '))
const principale = conti.find((a) => a.main)
if (!da) throw new Error(`Nessun sottoconto che inizi con "${cc} "`)
const org = await chiama('GET', '/organization')
const nomeOrg = org.ok ? (org.j.organization?.legal_name ?? org.j.organization?.name ?? 'Cooperativa Mirafiori') : 'Cooperativa Mirafiori'

const corpo = {
  request_multi_transfer: {
    note: 'PROVA dell’app Mirafiori — da RIFIUTARE',
    debit_iban: da.iban,
    transfers: [{
      amount: '0.01',
      currency: 'EUR',
      credit_iban: principale.iban,
      credit_account_name: nomeOrg.slice(0, 140),
      credit_account_currency: 'EUR',
      reference: 'PROVA APP MIRAFIORI - DA RIFIUTARE',
    }],
  },
}
console.log('\n=== RICHIESTA ===')
console.log(`  da:  ${da.name}  (${da.iban})`)
console.log(`  a:   ${principale.name}  (${principale.iban})  intestato a "${nomeOrg}"`)
console.log('  importo: 0,01 €')

if (!CREA) {
  console.log('\nSolo prova: niente creato. Aggiungi --crea per crearla davvero.')
  process.exit(0)
}

const r = await chiama('POST', '/requests/multi_transfers', corpo, { 'X-Qonto-Idempotency-Key': randomUUID() })
console.log(`\n=== RISPOSTA QONTO: ${r.status} ===`)
if (!r.ok) {
  console.log(JSON.stringify(r.j, null, 2))
  console.log('\n✗ La chiave API NON può creare richieste di bonifico. Servirà OAuth lato server.')
  process.exit(1)
}
const req = r.j.request_multi_transfer ?? r.j
console.log(`  id richiesta: ${req.id}`)
console.log(`  stato:        ${req.status}`)
console.log(`  creata da:    ${persone.get(req.initiator_id) ?? req.initiator_id}`)
console.log('\n✓ Creata. Ora aprila su Qonto (Richieste) e RIFIUTALA.')
console.log('  Dimmi a nome di chi risulta: chi la crea non può approvarla.')
