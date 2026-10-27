#!/usr/bin/env node
/**
 * Schede RU doppie: stessa persona con più schede (Dipendenti + Tirocini).
 * Raggruppa per CODICE FISCALE e per MAIL AZIENDALE e stampa ogni gruppo con
 * più di una scheda, con stato, matricola, date e chi l'ha creata/modificata.
 *
 * USO (dalla cartella web/):  node scripts/diagnosi-doppioni-ru.mjs
 * Sola lettura.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
const v = (x) => (typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim())

try {
  for (const r of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
    const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const tkRes = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.GRAPH_CLIENT_ID,
    client_secret: process.env.GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
})
const tk = (await tkRes.json()).access_token
const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID

async function tutti(listId) {
  const out = []
  let next = `https://graph.microsoft.com/v1.0/sites/${site}/lists/${listId}/items?$select=id,createdDateTime,createdBy,lastModifiedDateTime,lastModifiedBy&$expand=fields&$top=200`
  while (next) {
    const res = await fetch(next, { headers: { Authorization: `Bearer ${tk}`, Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error?.message || res.status)
    out.push(...d.value); next = d['@odata.nextLink'] || null
  }
  return out
}

const schede = []
for (const [lista, id] of [['Dipendenti', process.env.SP_LIST_DIPENDENTI], ['Tirocini', process.env.SP_LIST_TIROCINI]]) {
  if (!id) continue
  for (const it of await tutti(id)) schede.push({ lista, it, f: it.fields || {} })
}

function gruppi(chiave) {
  const m = new Map()
  for (const s of schede) {
    const k = chiave(s)
    if (!k) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(s)
  }
  return [...m.entries()].filter(([, g]) => g.length > 1)
}

function stampa(titolo, elenco) {
  console.log(`\n=== ${titolo}: ${elenco.length} gruppi\n`)
  for (const [k, g] of elenco) {
    console.log(`  ${k}`)
    for (const { lista, it, f } of g) {
      console.log(`    · ${lista} item ${it.id}  ${v(f.Cognome)} ${v(f.Nome)}  stato: ${v(f.StatoRapporto) || v(f.StatoTirocinio) || '(vuoto)'}  ` +
        `tipo: ${v(f.TipoRapporto) || '-'}  matr: ${v(f.Matricola) || '-'}  timbra: ${v(f.TimbraturaAttiva) || '-'}`)
      console.log(`      creata ${it.createdDateTime?.slice(0, 10)} da ${it.createdBy?.user?.displayName || '?'} · modificata ${it.lastModifiedDateTime?.slice(0, 10)} da ${it.lastModifiedBy?.user?.displayName || '?'}`)
    }
  }
}

console.log(`\nSchede lette: ${schede.length}`)
stampa('Stesso CODICE FISCALE', gruppi((s) => v(s.f.CodiceFiscale).toUpperCase()))
stampa('Stessa MAIL AZIENDALE', gruppi((s) => v(s.f.MailAziendale).toLowerCase()))
console.log('')
