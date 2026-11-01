#!/usr/bin/env node
/**
 * Importa nelle schede RU (lista Dipendenti, sito Risorse Umane) il NUMERO
 * SOCIO e la PAGINA DEL LIBRO SOCI dal file "Elenco GENERALE Soci e
 * Dipendenti.xlsx", foglio "Quote Sociali 2026":
 *
 *   N°    -> NumeroElencoGenerale   (numero)
 *   PAG.  -> PaginaLibroSoci        (testo così com'è: "101", "164/2013"…)
 *
 * Regola di Dennis (30/10/2026): il FILE VINCE sui dati già presenti. Una
 * cella VUOTA nel file invece non cancella niente: si lascia quello che c'è.
 * Si toccano SOLO questi due campi, con aggiornamento parziale (gli altri campi
 * della scheda restano intatti).
 *
 * Abbinamento: per codice fiscale; se manca o non trova, per "COGNOME NOME"
 * (anche parziale: "CORIO DANIELA" ↔ "CORIO DANIELA STEFANIA") purché la
 * corrispondenza sia unica. Ogni abbinamento non per CF è segnalato. Chi non si abbina viene elencato.
 *
 * Il file Excel NON si legge qui: exceljs si ferma sui filtri salvati nel
 * foglio ("Unexpected xml node in parseOpen"). Le quattro colonne che servono
 * (COGNOME NOME, Codice Fiscale, PAG., N°) sono estratte in
 * scripts/ru-data/soci-numero-pagina.json (cartella esclusa da git: dati
 * personali), formato { righe: [{ nome, cf, pagina, numero }] }.
 *
 * Uso (dalla cartella web/):
 *   node scripts/import-numero-pagina-soci.mjs            # prova: mostra cosa cambierebbe
 *   node scripts/import-numero-pagina-soci.mjs --apply    # scrive
 *   --file=percorso.json  (default: scripts/ru-data/soci-numero-pagina.json)
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SP_SITE_RU, SP_LIST_DIPENDENTI. Scrive con l'identità dell'app (come gli
 * altri import RU): nel log Microsoft risulterà l'app, non una persona.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
const FILE = resolve(arg('file') || join(__dirname, 'ru-data', 'soci-numero-pagina.json'))

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
const normCf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// ---------- file ----------
const righe = JSON.parse(readFileSync(FILE, 'utf8')).righe.map((r) => ({
  nome: String(r.nome ?? '').trim(),
  cf: normCf(r.cf),
  pagina: r.pagina == null || String(r.pagina).trim() === '' ? null : String(r.pagina).trim(),
  numero: r.numero == null || !Number.isFinite(Number(r.numero)) ? null : Number(r.numero),
})).filter((r) => r.nome)
console.log(`→ File: ${righe.length} persone`)

// ---------- SharePoint ----------
async function token() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const r = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: GRAPH_CLIENT_ID, client_secret: GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
  })
  if (!r.ok) throw new Error(`Token ${r.status}: ${await r.text()}`)
  return (await r.json()).access_token
}
const T = await token()
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
const schede = []
let url = `${base}?$expand=fields($select=Title,Cognome,Nome,CodiceFiscale,NumeroElencoGenerale,PaginaLibroSoci,StatoRapporto)&$top=500`
while (url) {
  const r = await graph('GET', url)
  for (const it of r.value) schede.push({ id: it.id, ...it.fields })
  url = r['@odata.nextLink'] || null
}
console.log(`→ SharePoint: ${schede.length} schede nella lista Dipendenti`)

const perCf = new Map()
const perNome = new Map()
for (const s of schede) {
  const cf = normCf(s.CodiceFiscale)
  if (cf) perCf.set(cf, [...(perCf.get(cf) ?? []), s])
  for (const k of new Set([norm(`${s.Cognome ?? ''} ${s.Nome ?? ''}`), norm(s.Title)])) {
    if (k) perNome.set(k, [...(perNome.get(k) ?? []), s])
  }
}

// ---------- confronto ----------
const modifiche = [], nonTrovati = [], ambigui = []
let invariati = 0
for (const r of righe) {
  let trovate = r.cf ? perCf.get(r.cf) ?? [] : []
  let come = 'CF'
  if (!trovate.length) { trovate = perNome.get(norm(r.nome)) ?? []; come = 'nome' }
  if (!trovate.length) {
    // "CORIO DANIELA" nel file, "CORIO DANIELA STEFANIA" in scheda: un nome
    // contenuto nell'altro, purché porti a una sola scheda.
    const k = norm(r.nome)
    trovate = [...perNome.entries()].filter(([n]) => n.startsWith(k + ' ') || k.startsWith(n + ' ')).flatMap(([, v]) => v)
    come = 'nome parziale'
  }
  const uniche = [...new Map(trovate.map((s) => [s.id, s])).values()]
  if (!uniche.length) { nonTrovati.push(r); continue }
  if (uniche.length > 1) { ambigui.push({ r, n: uniche.length, come }); continue }
  const s = uniche[0]
  const campi = {}
  if (r.numero != null && Number(s.NumeroElencoGenerale) !== r.numero) campi.NumeroElencoGenerale = r.numero
  if (r.pagina != null && String(s.PaginaLibroSoci ?? '').trim() !== r.pagina) campi.PaginaLibroSoci = r.pagina
  if (!Object.keys(campi).length) { invariati++; continue }
  modifiche.push({ r, s, campi, come })
}

const prima = (s, k) => (s[k] == null || s[k] === '' ? '—' : s[k])
console.log(`\n${APPLY ? 'MODIFICHE' : 'MODIFICHE PREVISTE (prova, niente scritto)'}: ${modifiche.length}`)
for (const m of modifiche) {
  const det = Object.entries(m.campi).map(([k, v]) => `${k === 'NumeroElencoGenerale' ? 'N°' : 'Pag.'} ${prima(m.s, k)} → ${v}`).join(' · ')
  console.log(`  ${m.r.nome.padEnd(32)} ${det}${m.come !== 'CF' ? `   (abbinato per ${m.come})` : ''}`)
}
console.log(`\nGià a posto: ${invariati}`)
if (ambigui.length) {
  console.log(`\n⚠ Più schede possibili, NON toccate (${ambigui.length}):`)
  for (const a of ambigui) console.log(`  ${a.r.nome} — ${a.n} schede per ${a.come}`)
}
if (nonTrovati.length) {
  console.log(`\n⚠ Nel file ma senza scheda RU (${nonTrovati.length}):`)
  for (const r of nonTrovati) console.log(`  ${r.nome}${r.numero != null ? ` (N° ${r.numero})` : ''}`)
}

if (!APPLY) {
  console.log('\nÈ una prova. Per scrivere davvero rilancia con --apply')
  process.exit(0)
}
let ok = 0
for (const m of modifiche) {
  try {
    await graph('PATCH', `${base}/${m.s.id}/fields`, m.campi)
    ok++
  } catch (e) {
    console.error(`✗ ${m.r.nome}: ${e.message}`)
  }
}
console.log(`\n✓ Aggiornate ${ok} schede su ${modifiche.length}`)
