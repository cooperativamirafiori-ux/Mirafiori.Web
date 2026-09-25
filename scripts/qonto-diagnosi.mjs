#!/usr/bin/env node
/**
 * Mostra la risposta grezza di Qonto per un conto e i suoi ultimi 3 movimenti,
 * con la stessa chiave API che usa l'app. Serve quando la scheda Qonto mostra
 * qualcosa di strano (saldo assente, controparti, allegati).
 *
 * Uso (dalla cartella web/):
 *   node scripts/qonto-diagnosi.mjs cc18
 */

import { loadEnvLocal } from './_qonto.mjs'

loadEnvLocal()
const cc = (process.argv[2] || '').toLowerCase()
const auth = `${process.env.QONTO_LOGIN}:${process.env.QONTO_SECRET}`
const get = async (p) => {
  const r = await fetch('https://thirdparty.qonto.com/v2' + p, { headers: { Authorization: auth, Accept: 'application/json' } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${p} → ${r.status}: ${t}`)
  return JSON.parse(t)
}

const { bank_accounts } = await get('/bank_accounts?per_page=100')
const conto = bank_accounts.find((a) => (a.name || '').toLowerCase().startsWith(cc + ' ')) ?? bank_accounts.find((a) => a.main)
console.log('=== CONTO (campi e valori) ===')
console.log(JSON.stringify(conto, null, 2))

const q = new URLSearchParams({ bank_account_id: conto.id, per_page: '3', sort_by: 'emitted_at:desc' })
q.append('status[]', 'pending')
q.append('status[]', 'completed')
const { transactions } = await get(`/transactions?${q}`)
console.log('\n=== ULTIMI 3 MOVIMENTI ===')
console.log(JSON.stringify(transactions, null, 2))

try {
  const org = await get('/organization')
  const conti = org.organization?.bank_accounts ?? []
  const c = conti.find((a) => a.id === conto.id)
  console.log('\n=== LO STESSO CONTO VISTO DA /organization ===')
  console.log(JSON.stringify(c ?? '(non presente)', null, 2))
} catch (e) {
  console.log('\n/organization:', e.message)
}
