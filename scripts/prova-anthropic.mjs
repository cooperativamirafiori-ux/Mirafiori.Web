#!/usr/bin/env node
/**
 * Verifica la chiave API Anthropic di .env.local:
 *  1. la chiave è accettata?
 *  2. il modello usato dall'app (ANTHROPIC_MODEL o quello predefinito) esiste?
 *  3. una chiamata minima risponde?
 *
 * Uso (da web/):  node scripts/prova-anthropic.mjs
 * Non invia nessun documento.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
  for (const riga of raw.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(riga.trim())
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

// Deve restare uguale a MODELLO_PREDEFINITO in lib/prestazioni/lettura-documenti.ts
const PREDEFINITO = 'claude-sonnet-5-5'
const chiave = process.env.ANTHROPIC_API_KEY
const modello = process.env.ANTHROPIC_MODEL || PREDEFINITO
if (!chiave) {
  console.error('✗ ANTHROPIC_API_KEY manca in .env.local: lancia prima  bash scripts/anthropic-chiave.sh')
  process.exit(1)
}
const h = { 'x-api-key': chiave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
if (process.env.ANTHROPIC_WORKSPACE_ID) h['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID

const r1 = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: h })
if (!r1.ok) {
  console.error(`✗ Chiave rifiutata (${r1.status}): ${(await r1.text()).slice(0, 200)}`)
  process.exit(1)
}
const modelli = (await r1.json()).data.map((m) => m.id)
console.log('✓ Chiave accettata')
console.log('  Modelli disponibili:', modelli.join(', '))
if (!modelli.includes(modello)) {
  console.error(`✗ Il modello "${modello}" non è nell'elenco. Scegline uno sopra e mettilo in ANTHROPIC_MODEL.`)
  process.exit(1)
}
console.log(`✓ Modello in uso: ${modello}`)

const r2 = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: h,
  body: JSON.stringify({ model: modello, max_tokens: 20, messages: [{ role: 'user', content: 'Rispondi solo: ok' }] }),
})
if (!r2.ok) {
  console.error(`✗ Chiamata di prova fallita (${r2.status}): ${(await r2.text()).slice(0, 300)}`)
  process.exit(1)
}
const d = await r2.json()
console.log(`✓ Risposta: "${d.content?.[0]?.text?.trim()}" (${d.usage?.input_tokens}+${d.usage?.output_tokens} token)`)
console.log('Tutto pronto: la lettura automatica dei documenti è attiva.')
