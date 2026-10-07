#!/usr/bin/env node
/**
 * Movimenti degli ultimi N giorni su TUTTI i conti Qonto, in ogni stato
 * (pending, completed, declined, reversed), con saldo e disponibile del conto.
 * Serve quando qualcuno dice "ho fatto un movimento ma in app non lo vedo".
 *
 * Uso (dalla cartella web/):
 *   node scripts/qonto-ultimi-movimenti.mjs
 *   node scripts/qonto-ultimi-movimenti.mjs 7
 */

import { loadEnvLocal } from './_qonto.mjs'

loadEnvLocal()
const giorni = Number(process.argv[2] || 3)
const da = new Date(Date.now() - giorni * 86400000).toISOString()
const auth = `${process.env.QONTO_LOGIN}:${process.env.QONTO_SECRET}`
const get = async (p) => {
  const r = await fetch('https://thirdparty.qonto.com/v2' + p, { headers: { Authorization: auth, Accept: 'application/json' } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${p.split('?')[0]} → ${r.status}: ${t}`)
  return JSON.parse(t)
}

const { bank_accounts } = await get('/bank_accounts?per_page=100')
let trovati = 0
for (const a of bank_accounts) {
  const q = new URLSearchParams({ bank_account_id: a.id, per_page: '20', sort_by: 'emitted_at:desc', updated_at_from: da })
  for (const s of ['pending', 'completed', 'declined', 'reversed']) q.append('status[]', s)
  const { transactions } = await get(`/transactions?${q}`)
  if (!transactions.length) continue
  trovati += transactions.length
  console.log(`\n## ${a.name}${a.main ? ' (principale)' : ''} | saldo ${a.balance_cents / 100} € | disponibile ${a.authorized_balance_cents / 100} €`)
  for (const t of transactions) {
    const segno = t.side === 'credit' ? '+' : '-'
    console.log(`  ${t.emitted_at.slice(0, 16)} | ${t.status.padEnd(9)} | ${segno}${t.amount_cents / 100} € | ${t.operation_type} | ${t.clean_counterparty_name || t.label} | contabilizzato: ${t.settled_at ?? 'no'}`)
  }
}
if (!trovati) console.log(`Nessun movimento negli ultimi ${giorni} giorni su nessun conto.`)
