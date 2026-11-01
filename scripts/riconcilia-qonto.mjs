#!/usr/bin/env node
/**
 * Riconciliazione Qonto ↔ fatture lanciata dal terminale. Non legge Qonto da qui:
 * chiama l'app in produzione (come estratto-qonto.mjs), che usa le sue variabili.
 *
 * Uso (dalla cartella web/):
 *   node scripts/riconcilia-qonto.mjs --storico --prova   cosa farebbe sullo storico (da settembre), senza toccare niente
 *   node scripts/riconcilia-qonto.mjs --storico           lo fa davvero (una tantum)
 *   node scripts/riconcilia-qonto.mjs                     il giro normale, come di notte
 *
 * Richiede CRON_SECRET in .env.local (lo stesso di Vercel). --url= per un'altra app.
 * Regole: docs/riconciliazione-qonto.md.
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

const ha = (n) => process.argv.includes(`--${n}`)
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=') ?? ''
const daEnv = process.env.APP_BASE_URL || ''
const base = (arg('url') || (/localhost|127\.0\.0\.1/.test(daEnv) ? '' : daEnv) || 'https://mirafiori-web.vercel.app').replace(/\/+$/, '')
if (!process.env.CRON_SECRET) {
  console.error('✗ Manca CRON_SECRET in .env.local')
  process.exit(1)
}

const q = new URLSearchParams()
if (ha('storico')) q.set('storico', '1')
if (ha('prova')) q.set('prova', '1')
console.log(`→ ${ha('storico') ? 'Storico da settembre' : 'Giro normale'}${ha('prova') ? ' — PROVA, non cambia niente' : ''}. Può volerci qualche minuto…`)

const res = await fetch(`${base}/api/cron/riconcilia-qonto?${q}`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })
const testo = await res.text()
if (res.status === 401) { console.error('✗ 401: il CRON_SECRET di .env.local non è quello di Vercel.'); process.exit(1) }
if (!res.ok) { console.error(`✗ ${res.status}: ${testo.slice(0, 800)}`); process.exit(1) }
const j = JSON.parse(testo)

const euro = (n) => Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const l = j.lettura ?? {}
const a = j.abbinamento ?? {}
console.log(`\nMovimenti letti da Qonto: ${l.letti ?? 0} su ${l.conti ?? 0} conti${l.errori?.length ? ` — ${l.errori.length} conti NON letti:\n  ${l.errori.join('\n  ')}` : ''}`)
console.log(`${j.prova ? 'Si abbinerebbero' : 'Abbinati'}: ${a.abbinati ?? 0} movimenti → ${a.scadenzeChiuse ?? 0} fatture ${j.prova ? 'si chiuderebbero' : 'chiuse'} (le altre solo collegate, erano già pagate)`)
for (const d of a.dettaglio ?? []) {
  const aperte = d.fatture.filter((f) => f.stato !== 'pagata')
  if (!aperte.length) continue
  console.log(`  ${d.data}  ${euro(d.importo).padStart(12)}  ${d.controparte ?? '—'}  [${d.conto ?? ''}]`)
  for (const f of aperte) console.log(`      → ${f.fornitore} · fatt. ${f.numero ?? '?'} del ${f.data ?? '?'} · ${euro(f.importo)} (era ${f.stato})`)
}
if (j.storico) {
  console.log(`\nUscite di prima del 1/11 senza nessuna fattura aperta plausibile: ${j.storico.archiviati} ${j.prova ? 'si archivierebbero' : 'archiviate'}`)
  console.log(`Uscite di prima del 1/11 che restano da abbinare a mano (hanno una fattura aperta simile): ${j.storico.restanoDaAbbinare}`)
}
console.log(j.prova ? '\nEra una prova: niente è cambiato.' : '\nFatto. Il resto è in Flussi fatture → «Da abbinare (Qonto)».')
