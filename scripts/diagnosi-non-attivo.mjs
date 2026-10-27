#!/usr/bin/env node
/**
 * Perché una persona risulta "non più attivo" nel Cruscotto Timbrature?
 * Legge la scheda RU (Dipendenti + Tirocini) e dice quale delle tre condizioni
 * di abilitazione() in lib/timbrature/sync.ts non è soddisfatta:
 *   1. spunta "Timbratura attiva" = Si
 *   2. rapporto non Cessato / tirocinio non INTERROTTO-TERMINATO
 *   3. scheda di un lavoratore (Tipo di rapporto, o in mancanza contratto/matricola)
 *
 * USO (dalla cartella web/):  node scripts/diagnosi-non-attivo.mjs dotto ravelli
 * Sola lettura.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))

const LAVORATORI = ['Dipendente', 'Socio lavoratore', 'Apprendista', 'Libero professionista',
  'Socio libero professionista', 'Collaborazione Coordinate Continuativa',
  'Tirocinante e/o Stagista', 'Volontario in servizio civile']
const NON_LAVORATORI = ['Socio volontario', 'Socio fruitore', 'Socio persona giuridica', 'Socio sovventore e finanziatore']
const v = (x) => (typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim())

try {
  for (const r of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
    const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const cerca = process.argv.slice(2).map((s) => s.toLowerCase())
if (!cerca.length) { console.error('Uso: node scripts/diagnosi-non-attivo.mjs <testo> [<testo>...]'); process.exit(1) }

const tkRes = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.GRAPH_CLIENT_ID,
    client_secret: process.env.GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
})
const tk = (await tkRes.json()).access_token
const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID

async function tutti(listId) {
  const out = []
  let next = `https://graph.microsoft.com/v1.0/sites/${site}/lists/${listId}/items?$select=id,lastModifiedDateTime,lastModifiedBy&$expand=fields&$top=200`
  while (next) {
    const res = await fetch(next, { headers: { Authorization: `Bearer ${tk}`, Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error?.message || res.status)
    out.push(...d.value); next = d['@odata.nextLink'] || null
  }
  return out
}

const base = process.env.SUPABASE_URL.replace(/\/+$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = await (await fetch(`${base}/rest/v1/dipendente?select=id,email,attivo,referente_email`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })).json()

for (const [nome, listId] of [['Dipendenti', process.env.SP_LIST_DIPENDENTI], ['Tirocini', process.env.SP_LIST_TIROCINI]]) {
  if (!listId) continue
  for (const it of await tutti(listId)) {
    const f = it.fields || {}
    const testo = `${v(f.Cognome)} ${v(f.Nome)} ${v(f.MailAziendale)}`.toLowerCase()
    if (!cerca.some((c) => testo.includes(c))) continue
    const tirocinio = nome === 'Tirocini'
    const tipo = v(f.TipoRapporto)
    const classe = tirocinio ? 'lavoratore'
      : LAVORATORI.includes(tipo) ? 'lavoratore'
      : NON_LAVORATORI.includes(tipo) ? 'non-lavoratore'
      : (v(f.TipoContratto) || v(f.Matricola)) ? 'lavoratore' : 'incerto'
    const spunta = v(f.TimbraturaAttiva) === 'Si'
    const chiuso = v(f.StatoRapporto) === 'Cessato' || ['INTERROTTO', 'TERMINATO'].includes(v(f.StatoTirocinio).toUpperCase())
    const mail = v(f.MailAziendale).toLowerCase()
    const riga = sb.find((r) => String(r.email).toLowerCase() === mail)
    console.log(`\n=== ${v(f.Cognome)} ${v(f.Nome)}  (${nome}, item ${it.id})`)
    console.log(`  MailAziendale ....... ${mail || '(vuota)'}`)
    console.log(`  TimbraturaAttiva .... ${v(f.TimbraturaAttiva) || '(vuoto)'}   ${spunta ? '✓' : '✗ MANCA LA SPUNTA'}`)
    console.log(`  Stato rapporto ...... ${v(f.StatoRapporto) || v(f.StatoTirocinio) || '(vuoto)'}   ${chiuso ? '✗ CHIUSO' : '✓'}`)
    console.log(`  Tipo rapporto ....... ${tipo || '(vuoto)'} · contratto: ${v(f.TipoContratto) || '(vuoto)'} · matricola: ${v(f.Matricola) || '(vuota)'}   → ${classe}${classe === 'lavoratore' ? ' ✓' : ' ✗'}`)
    console.log(`  Referente foglio ore  ${v(f.ReferenteFoglioOre) || '(vuoto)'}`)
    console.log(`  Ultima modifica ..... ${it.lastModifiedDateTime} da ${it.lastModifiedBy?.user?.displayName || '?'}`)
    console.log(`  Esito atteso ........ ${spunta && !chiuso && classe === 'lavoratore' ? 'ATTIVO' : 'non attivo'}`)
    console.log(`  Supabase ............ ${riga ? `id ${riga.id}, ${riga.attivo ? 'attivo' : 'NON attivo'}, referente ${riga.referente_email || '(vuoto)'}` : 'nessuna riga'}`)
  }
}
console.log('')
