#!/usr/bin/env node
/**
 * Manda a mano l'estratto Qonto settimanale (lo stesso del lunedì mattina).
 *
 * Non legge Qonto da qui: chiama l'app in produzione, che fa tutto con le sue
 * variabili (chiave Qonto, mail). Serve per:
 *   - la PROVA prima di lasciarlo andare da solo: --a=tua@mail
 *   - RECUPERARE una settimana se un lunedì Qonto non ha risposto.
 *
 * Uso (dalla cartella web/):
 *   node scripts/estratto-qonto.mjs --a=dennis.maseri@cooperativamirafiori.com
 *   node scripts/estratto-qonto.mjs --settimana=2026-10-19
 *   node scripts/estratto-qonto.mjs --settimana=2026-10-19 --a=dennis.maseri@cooperativamirafiori.com
 *
 * --settimana = un giorno qualsiasi della settimana (lun–dom). Senza: quella appena finita.
 * Senza --a va ai destinatari normali (Alessandro).
 *
 * Richiede in .env.local: CRON_SECRET (lo stesso che sta su Vercel), APP_BASE_URL.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ENV = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local')
try {
  for (const riga of readFileSync(ENV, 'utf8').split('\n')) {
    const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* variabili già nell'ambiente */ }

const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=').slice(1).join('=') ?? ''
const base = (process.env.APP_BASE_URL || 'https://mirafiori-web.vercel.app').replace(/\/+$/, '')
const q = new URLSearchParams()
if (arg('settimana')) q.set('settimana', arg('settimana'))
if (arg('a')) q.set('a', arg('a'))

if (!process.env.CRON_SECRET) {
  console.error('✗ Manca CRON_SECRET in .env.local')
  process.exit(1)
}

console.log(`→ Chiedo all'app di preparare e mandare l'estratto${arg('a') ? ` (solo a ${arg('a')})` : ' (ai destinatari normali)'}...`)
const res = await fetch(`${base}/api/cron/estratti-qonto?${q}`, {
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
})
const testo = await res.text()
if (res.status === 401) {
  console.error('✗ 401: il CRON_SECRET di .env.local non è quello di Vercel.')
  process.exit(1)
}
if (!res.ok) {
  console.error(`✗ ${res.status}: ${testo.slice(0, 500)}`)
  process.exit(1)
}
const j = JSON.parse(testo)
console.log(`✓ Settimana ${j.dal} → ${j.al}: ${j.conti} conti, ${j.movimenti} movimenti, mandato a ${j.destinatari?.join(', ')}`)
