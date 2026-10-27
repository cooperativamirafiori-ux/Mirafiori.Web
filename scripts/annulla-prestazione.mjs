#!/usr/bin/env node
/**
 * Annulla da terminale una pratica che NON è più in Bozza (es. una prova già
 * mandata in firma). Dall'app si annulla solo in Bozza: questo è lo strumento
 * per amministratori nei casi eccezionali.
 *
 * Porta lo stato ad "Annullata" (il record resta, sparisce dalle attive e dal
 * controllo giornaliero delle firme). NON ritira la busta DocuSign: se serve,
 * si annulla ("Void") dal sito DocuSign — lo script stampa l'id della busta.
 *
 * Uso (da web/):
 *   node scripts/annulla-prestazione.mjs PREST-2026-007            SIMULAZIONE
 *   node scripts/annulla-prestazione.mjs PREST-2026-007 --conferma esegue
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  for (const riga of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(riga)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const id = (process.argv[2] || '').trim().toUpperCase()
const CONFERMA = process.argv.includes('--conferma')
if (!/^PREST-\d{4}-\d{3,}$/.test(id)) {
  console.error('Uso: node scripts/annulla-prestazione.mjs PREST-AAAA-NNN [--conferma]')
  process.exit(1)
}

const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SHAREPOINT_SITE_ID: site, SP_LIST_PRESTAZIONI: lista } = process.env
const tok = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: GRAPH_CLIENT_ID, client_secret: GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
}).then((r) => r.json())
const h = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json', Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

const filtro = encodeURIComponent(`fields/Title eq '${id}'`)
const res = await fetch(
  `https://graph.microsoft.com/v1.0/sites/${site}/lists/${lista}/items?$expand=fields($select=Title,Nome,Cognome,Stato,ResponsabileNome,DocusignEnvelopeId)&$filter=${filtro}&$top=2`,
  { headers: h },
).then((r) => r.json())
const item = res.value?.[0]
if (!item) {
  console.error(`✗ Pratica ${id} non trovata.`)
  process.exit(1)
}
const f = item.fields
console.log(`${id} — ${f.Cognome} ${f.Nome} — stato "${f.Stato}" — resp. ${f.ResponsabileNome}`)
if (f.Stato === 'Annullata') {
  console.log('= già annullata, niente da fare.')
  process.exit(0)
}
if (f.Stato === 'Chiusa') {
  console.error('✗ La pratica è chiusa: non si annulla.')
  process.exit(1)
}
if (!CONFERMA) {
  console.log('SIMULAZIONE: rilancia con --conferma per portarla ad "Annullata".')
  process.exit(0)
}
const p = await fetch(`https://graph.microsoft.com/v1.0/sites/${site}/lists/${lista}/items/${item.id}/fields`, {
  method: 'PATCH',
  headers: h,
  body: JSON.stringify({ Stato: 'Annullata' }),
})
if (!p.ok) {
  console.error(`✗ Aggiornamento fallito (${p.status}): ${(await p.text()).slice(0, 200)}`)
  process.exit(1)
}
console.log(`✓ ${id} annullata.`)
if (f.DocusignEnvelopeId) {
  console.log(`  Busta DocuSign ancora aperta: ${f.DocusignEnvelopeId} — se serve, annullala ("Void") dal sito DocuSign.`)
}
