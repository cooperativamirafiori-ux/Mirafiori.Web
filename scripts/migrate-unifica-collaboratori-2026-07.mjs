#!/usr/bin/env node
/**
 * Unificazione anagrafiche: porta i COLLABORATORI dentro la lista DIPENDENTI,
 * distinguendoli con la colonna "CategoriaRU" (Dipendente / Collaboratore).
 *
 * PREREQUISITO: aver già aggiunto la colonna CategoriaRU alla lista Dipendenti,
 * cioè aver rilanciato:  node scripts/provision-risorse-umane.mjs
 *
 * COSA FA (idempotente, rilanciabile):
 *   1) Tagga come "Dipendente" ogni record della lista Dipendenti che non ha
 *      ancora un valore in CategoriaRU (non tocca chi è già taggato).
 *   2) Per ogni collaboratore della lista Collaboratori:
 *        - se il suo CF (o, in mancanza, il nome) corrisponde a un dipendente
 *          già presente -> NON crea nulla: lo segnala come possibile duplicato,
 *          da valutare a mano (non cambia il tag di quel dipendente);
 *        - altrimenti CREA un nuovo record nella lista Dipendenti con
 *          CategoriaRU="Collaboratore", mappando i campi senza perdite:
 *            SocioCooperativa   -> Socio
 *            CapitaleSociale    -> QuotaSociale
 *            ServizioCoop       -> ServizioAppartenenza
 *            RecapitoTelefonico -> CellPrivato (se vuoto; altrimenti va in Note)
 *            CategoriaProfessionale / TipoPrestazione -> aggiunti in Note
 *          (i campi comuni: Cognome, Nome, Genere, DataNascita, CF, contatti,
 *           TitoloStudio, Note, ecc. vengono copiati tali e quali).
 *
 * NON elimina né svuota la lista Collaboratori: resta come backup.
 *
 * USO (dalla cartella web/):
 *   node scripts/migrate-unifica-collaboratori-2026-07.mjs           # dry-run
 *   node scripts/migrate-unifica-collaboratori-2026-07.mjs --apply    # applica
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_DIPENDENTI, SP_LIST_COLLABORATORI.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

// Campi comuni copiati tali e quali dal collaboratore al nuovo dipendente.
const CAMPI_COMUNI = [
  'IdAccess', 'Cognome', 'Nome', 'Genere', 'DataNascita', 'LuogoNascita',
  'CodiceFiscale', 'Nazionalita', 'AreaGeografica', 'StatoCivile', 'Residenza',
  'Domicilio', 'CellAziendale', 'CellPrivato', 'MailAziendale', 'MailPersonale',
  'TitoloStudio', 'Note',
]
// Campi specifici del collaboratore letti dalla lista di origine.
const CAMPI_COLLAB = [
  'SocioCooperativa', 'CapitaleSociale', 'ServizioCoop', 'RecapitoTelefonico',
  'CategoriaProfessionale', 'TipoPrestazione',
]

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* env già impostate */ }
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  })
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

async function graph(token, method, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${t}`)
  return t ? JSON.parse(t) : {}
}

async function getAll(token, site, listId, select) {
  const out = []
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=${select})&$top=200`
  while (url) {
    const res = await graph(token, 'GET', url)
    out.push(...(res.value || []))
    const next = res['@odata.nextLink']
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

// ---- helpers valori ----
const normCF = (s) => (s == null ? '' : String(s).replace(/[\s ]/g, '').toUpperCase())
function normName(s) {
  if (s == null) return ''
  const b = String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['`´’]/g, '').replace(/[^A-Za-z0-9\s]/g, ' ').toUpperCase().trim()
  return b.split(/\s+/).filter(Boolean).sort().join(' ')
}
const has = (v) => v != null && String(v).trim() !== ''
function dateToGraph(v) {
  if (!has(v)) return null
  const g = String(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(g) ? `${g}T12:00:00Z` : null
}
function num(v) {
  if (!has(v)) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const txt = (v) => (has(v) ? String(v).trim() : null)

/** Costruisce i campi del nuovo record Dipendente a partire dal collaboratore. */
function buildNuovoDipendente(f) {
  const out = {}
  for (const k of CAMPI_COMUNI) {
    if (k === 'DataNascita') out[k] = dateToGraph(f[k])
    else out[k] = f[k] ?? null
  }

  // mappature senza perdite
  if (has(f.SocioCooperativa)) out.Socio = f.SocioCooperativa
  if (has(f.CapitaleSociale)) out.QuotaSociale = num(f.CapitaleSociale)
  if (has(f.ServizioCoop)) out.ServizioAppartenenza = f.ServizioCoop

  // RecapitoTelefonico -> CellPrivato se libero, altrimenti finirà in Note
  const noteExtra = []
  if (has(f.RecapitoTelefonico)) {
    if (!has(out.CellPrivato)) out.CellPrivato = txt(f.RecapitoTelefonico)
    else noteExtra.push(`Recapito telefonico: ${txt(f.RecapitoTelefonico)}`)
  }
  if (has(f.CategoriaProfessionale)) noteExtra.push(`Categoria professionale: ${txt(f.CategoriaProfessionale)}`)
  if (has(f.TipoPrestazione)) noteExtra.push(`Tipo prestazione: ${txt(f.TipoPrestazione)}`)

  const noteBase = txt(out.Note)
  out.Note = [noteBase, noteExtra.join(' — ')].filter(Boolean).join('\n') || null

  out.CategoriaRU = 'Collaboratore'
  out.Title = `${String(f.Cognome ?? '').trim()} ${String(f.Nome ?? '').trim()}`.trim() || 'Senza nome'
  // rimuovi le chiavi null per non forzare valori vuoti alla creazione
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k]
  return out
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_DIPENDENTI', 'SP_LIST_COLLABORATORI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const listaDip = process.env.SP_LIST_DIPENDENTI
  const listaCol = process.env.SP_LIST_COLLABORATORI
  console.log(`→ Modalità: ${APPLY ? 'APPLICA (scrive su SharePoint)' : 'DRY-RUN (nessuna modifica)'}\n`)

  const token = await getToken()

  // controllo che la colonna CategoriaRU esista sulla lista Dipendenti
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listaDip}/columns?$select=name&$top=300`)
  if (!(cols.value || []).some((c) => c.name === 'CategoriaRU')) {
    throw new Error('La colonna "CategoriaRU" non esiste ancora nella lista Dipendenti. Esegui prima: node scripts/provision-risorse-umane.mjs')
  }

  const dip = await getAll(token, site, listaDip, 'Cognome,Nome,CodiceFiscale,CategoriaRU')
  const col = await getAll(token, site, listaCol, [...CAMPI_COMUNI, ...CAMPI_COLLAB].join(','))
  console.log(`→ Dipendenti in lista: ${dip.length}  |  Collaboratori da migrare: ${col.length}\n`)

  // indici per il match
  const perCF = new Map(), perNome = new Map()
  for (const it of dip) {
    const f = it.fields || {}
    const cf = normCF(f.CodiceFiscale); if (cf) perCF.set(cf, it)
    const nn = normName(`${f.Cognome ?? ''} ${f.Nome ?? ''}`); if (nn && !perNome.has(nn)) perNome.set(nn, it)
  }

  // ---- STEP 1: tagga i dipendenti senza CategoriaRU ----
  const daTaggare = dip.filter((it) => !has((it.fields || {}).CategoriaRU))
  console.log(`STEP 1 — Dipendenti da taggare "Dipendente": ${daTaggare.length}`)
  for (const it of daTaggare) {
    if (APPLY) await graph(token, 'PATCH', `/sites/${site}/lists/${listaDip}/items/${it.id}/fields`, { CategoriaRU: 'Dipendente' })
  }

  // ---- STEP 2: migra i collaboratori ----
  console.log(`\nSTEP 2 — Collaboratori`)
  let creati = 0
  const duplicati = []
  for (const it of col) {
    const f = it.fields || {}
    const nome = `${f.Cognome ?? ''} ${f.Nome ?? ''}`.trim() || `#${it.id}`
    const cf = normCF(f.CodiceFiscale)
    const match = (cf && perCF.get(cf)) || perNome.get(normName(nome))
    if (match) {
      const mf = match.fields || {}
      duplicati.push({ nome, cf: cf || '∅', dipId: match.id, dipNome: `${mf.Cognome ?? ''} ${mf.Nome ?? ''}`.trim() })
      continue
    }
    const nuovo = buildNuovoDipendente(f)
    creati++
    console.log(`  + CREA "${nome}"  (Socio=${nuovo.Socio ?? '—'}, Servizio=${nuovo.ServizioAppartenenza ?? '—'}, Quota=${nuovo.QuotaSociale ?? '—'})`)
    if (APPLY) await graph(token, 'POST', `/sites/${site}/lists/${listaDip}/items`, { fields: nuovo })
  }

  console.log('\n============================================================')
  console.log(`Dipendenti taggati "Dipendente":   ${daTaggare.length}`)
  console.log(`Collaboratori creati come record:  ${creati}`)
  console.log(`Possibili duplicati (già presenti tra i dipendenti): ${duplicati.length}`)
  if (duplicati.length) {
    console.log('\n— DA VALUTARE A MANO (collaboratore con CF/nome già tra i dipendenti — NON creato):')
    for (const d of duplicati) console.log(`   ${d.nome}  CF=${d.cf}  → dipendente esistente "${d.dipNome}" [id ${d.dipId}]`)
    console.log('   Se è la stessa persona e va marcata come collaboratore, cambia CategoriaRU a mano dal gestionale.')
  }
  if (!APPLY) console.log('\nRilancia con --apply per scrivere le modifiche su SharePoint.')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
