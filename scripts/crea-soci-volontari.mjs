#!/usr/bin/env node
/**
 * Crea in Personale (lista Dipendenti, sito Risorse Umane) le schede dei soci
 * volontari che risultano nel libro soci ma non hanno ancora una scheda.
 *
 * Convenzione dei soci volontari (la stessa dell'import di luglio 2026, vedi
 * import-quote-soci-2026.mjs): nessuna sezione a parte, stanno in Personale con
 *   CategoriaRU = Collaboratore · TipoRapporto = Socio volontario · Socio = Si
 * Il tipo di rapporto li esclude anche dalle timbrature (classeLavoro).
 *
 * Dati in scripts/ru-data/soci-volontari-nuovi.json (escluso da git: dati
 * personali), estratti il 30/10/2026 dal foglio "Quote Sociali 2026".
 * Prima di creare controlla codice fiscale e nome: chi c'è già non si duplica
 * (regola "una scheda per persona" del 27/10/2026).
 *
 * Uso (dalla cartella web/):
 *   node scripts/crea-soci-volontari.mjs           # prova
 *   node scripts/crea-soci-volontari.mjs --apply   # crea
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SP_SITE_RU, SP_LIST_DIPENDENTI.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const FILE = join(__dirname, 'ru-data', 'soci-volontari-nuovi.json')

try {
  for (const riga of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
    const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* env già nell'ambiente */ }
for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SP_SITE_RU', 'SP_LIST_DIPENDENTI']) {
  if (!process.env[k]) { console.error(`✗ Manca ${k} in .env.local`); process.exit(1) }
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const soci = JSON.parse(readFileSync(FILE, 'utf8')).soci

const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
const tr = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: GRAPH_CLIENT_ID, client_secret: GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
})
if (!tr.ok) throw new Error(`Token ${tr.status}: ${await tr.text()}`)
const T = (await tr.json()).access_token
async function graph(method, url, body) {
  const r = await fetch(url.startsWith('http') ? url : `https://graph.microsoft.com/v1.0${url}`, {
    method,
    headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json', Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : {}
}

const base = `/sites/${process.env.SP_SITE_RU}/lists/${process.env.SP_LIST_DIPENDENTI}/items`
const esistenti = []
let url = `${base}?$expand=fields($select=Title,Cognome,Nome,CodiceFiscale)&$top=500`
while (url) {
  const r = await graph('GET', url)
  esistenti.push(...r.value.map((it) => it.fields))
  url = r['@odata.nextLink'] || null
}
const cfs = new Set(esistenti.map((f) => String(f.CodiceFiscale ?? '').toUpperCase().trim()).filter(Boolean))
const nomi = new Set(esistenti.flatMap((f) => [norm(`${f.Cognome ?? ''} ${f.Nome ?? ''}`), norm(f.Title)]))

const giorno = (d) => (d ? `${d}T12:00:00Z` : null)
for (const s of soci) {
  const chi = `${s.Cognome} ${s.Nome}`
  if (cfs.has(s.CodiceFiscale) || nomi.has(norm(chi))) {
    console.log(`= ${chi}: esiste già una scheda, non la creo`)
    continue
  }
  const fields = {
    Title: chi,
    Cognome: s.Cognome,
    Nome: s.Nome,
    CodiceFiscale: s.CodiceFiscale,
    DataNascita: giorno(s.DataNascita),
    Genere: s.Genere,
    AreaGeografica: s.AreaGeografica,
    AreaAssunzione: s.AreaAssunzione,
    MailPersonale: s.MailPersonale,
    CategoriaRU: 'Collaboratore',
    TipoRapporto: 'Socio volontario',
    Socio: 'Si',
    DataAmmissioneSocio: giorno(s.DataAmmissioneSocio),
    NumeroElencoGenerale: s.NumeroElencoGenerale ?? null,
    PaginaLibroSoci: s.PaginaLibroSoci ?? null,
    QuotaSociale: s.QuotaSociale ?? null,
    QuotaSocialeVersata: s.QuotaSocialeVersata ?? null,
  }
  for (const k of Object.keys(fields)) if (fields[k] == null) delete fields[k]
  if (!APPLY) {
    console.log(`+ ${chi}: da creare (N° ${s.NumeroElencoGenerale ?? '—'}, pag. ${s.PaginaLibroSoci ?? '—'})`)
    continue
  }
  const r = await graph('POST', base, { fields })
  console.log(`✓ ${chi}: creata (id ${r.id})`)
}
if (!APPLY) console.log('\nÈ una prova. Per creare davvero rilancia con --apply')
