#!/usr/bin/env node
/**
 * Completa la migrazione dei Collaboratori (se necessario) ed elimina la
 * vecchia lista SharePoint "Collaboratori" DOPO aver verificato che ogni suo
 * record sia rintracciabile nella lista Dipendenti unificata.
 *
 * CONTESTO: il primo lancio di migrate-unifica-collaboratori-2026-07.mjs ha
 * migrato 8 collaboratori su 14 (gli altri 6 non erano né stati creati né
 * segnalati come duplicati — probabile interruzione a metà del ciclo, perché
 * quello script non isola gli errori riga per riga). Questo script:
 *   1) fa SEMPRE un backup JSON completo della lista Collaboratori, prima di
 *      qualunque altra cosa (scripts/ru-data/collaboratori-backup-<data>.json);
 *   2) con --migra-mancanti: ritenta la creazione (con try/catch per singolo
 *      record, così un errore non blocca gli altri) di ogni collaboratore non
 *      ancora rintracciabile nella lista Dipendenti, con LA STESSA logica di
 *      mappatura campi di migrate-unifica-collaboratori-2026-07.mjs (stesso
 *      matching per Codice Fiscale o nome normalizzato, stesse conversioni
 *      SocioCooperativa/CapitaleSociale/ServizioCoop/RecapitoTelefonico);
 *   3) verifica la copertura: ogni collaboratore deve risultare o migrato
 *      (CategoriaRU=Collaboratore) o già presente come Dipendente "vero"
 *      (duplicato). Se resta anche un solo orfano, NON elimina nulla;
 *   4) elimina la lista Collaboratori SOLO con --conferma-eliminazione, e
 *      solo se la verifica del punto 3 è pulita.
 *
 * USO (dalla cartella web/):
 *   node scripts/elimina-lista-collaboratori.mjs                                       # solo backup + verifica
 *   node scripts/elimina-lista-collaboratori.mjs --migra-mancanti                      # + ritenta la creazione dei mancanti
 *   node scripts/elimina-lista-collaboratori.mjs --migra-mancanti --conferma-eliminazione  # + elimina la lista se tutto ok
 *
 * NB: il cestino del sito SharePoint conserva le liste eliminate per un
 * periodo limitato (di norma ~93 giorni): recuperabile da lì per un po', ma
 * non fare affidamento su questo — per questo il backup JSON è sempre salvato
 * PRIMA, a prescindere dai flag.
 *
 * Dopo l'eliminazione ricorda di:
 *   - rimuovere SP_LIST_COLLABORATORI da .env.local e dalle Environment
 *     Variables di Vercel;
 *   - valutare se rimuovere le pagine/route ormai morte
 *     app/(app)/risorse-umane/collaboratori/ e app/api/risorse-umane/collaboratori/
 *     (non più raggiungibili dalla home RU, ma ancora nel codice).
 * Questo script non tocca il codice: solo le liste su SharePoint.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'ru-data')
const MIGRA = process.argv.includes('--migra-mancanti')
const ELIMINA = process.argv.includes('--conferma-eliminazione')

// Campi comuni copiati tali e quali dal collaboratore al nuovo dipendente
// (identici a migrate-unifica-collaboratori-2026-07.mjs).
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
const CAMPI_BACKUP = ['Title', ...CAMPI_COMUNI, ...CAMPI_COLLAB]

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const val = m[2].replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = val
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

async function leggiTuttaLaLista(token, site, listId, campi) {
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=${campi.join(',')})&$top=200`
  const out = []
  while (url) {
    const res = await graph(token, 'GET', url)
    for (const it of res.value || []) out.push({ id: it.id, fields: it.fields || {} })
    url = res['@odata.nextLink'] ? res['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

// ---- helpers valori (identici a migrate-unifica-collaboratori-2026-07.mjs,
// per usare ESATTAMENTE la stessa logica di match/mappatura) ----
const normCF = (v) => (v == null ? '' : String(v).replace(/\s/g, '').toUpperCase())
function normName(v) {
  if (v == null) return ''
  const b = String(v).normalize('NFD').replace(/[̀-ͯ]/g, '')
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
const nomeCompleto = (f) => `${f.Cognome ?? ''} ${f.Nome ?? ''}`.trim()

/** Costruisce i campi del nuovo record Dipendente a partire dal collaboratore
 * (stessa logica di migrate-unifica-collaboratori-2026-07.mjs). */
function buildNuovoDipendente(f) {
  const out = {}
  for (const k of CAMPI_COMUNI) {
    out[k] = k === 'DataNascita' ? dateToGraph(f[k]) : (f[k] ?? null)
  }
  if (has(f.SocioCooperativa)) out.Socio = f.SocioCooperativa
  if (has(f.CapitaleSociale)) out.QuotaSociale = num(f.CapitaleSociale)
  if (has(f.ServizioCoop)) out.ServizioAppartenenza = f.ServizioCoop

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
  out.Title = nomeCompleto(f) || 'Senza nome'
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k]
  return out
}

/** Indici Dipendenti per Codice Fiscale e nome normalizzato. */
function costruisciIndici(dipendenti) {
  const perCF = new Map()
  const perNome = new Map()
  for (const it of dipendenti) {
    const f = it.fields || {}
    const cf = normCF(f.CodiceFiscale)
    if (cf) perCF.set(cf, it)
    const nn = normName(nomeCompleto(f))
    if (nn && !perNome.has(nn)) perNome.set(nn, it)
  }
  return { perCF, perNome }
}

function trovaMatch(f, perCF, perNome) {
  const cf = normCF(f.CodiceFiscale)
  if (cf && perCF.has(cf)) return perCF.get(cf)
  return perNome.get(normName(nomeCompleto(f))) || null
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_DIPENDENTI', 'SP_LIST_COLLABORATORI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante in .env.local: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const listCollab = process.env.SP_LIST_COLLABORATORI
  const listDip = process.env.SP_LIST_DIPENDENTI

  console.log('→ Autenticazione Graph...')
  const token = await getToken()

  console.log('→ Lettura lista Collaboratori (per backup, migrazione e verifica)...')
  const collaboratori = await leggiTuttaLaLista(token, site, listCollab, CAMPI_BACKUP)
  console.log(`  ${collaboratori.length} record trovati.`)

  // --- 1) BACKUP, sempre, prima di qualunque scrittura ---
  mkdirSync(DATA_DIR, { recursive: true })
  const timestamp = new Date().toISOString().slice(0, 10)
  const backupPath = join(DATA_DIR, `collaboratori-backup-${timestamp}.json`)
  writeFileSync(backupPath, JSON.stringify(collaboratori, null, 2), 'utf8')
  console.log(`  ✓ Backup salvato in ${backupPath}`)

  console.log('\n→ Lettura lista Dipendenti...')
  let dipendenti = await leggiTuttaLaLista(token, site, listDip, ['Cognome', 'Nome', 'CodiceFiscale', 'CategoriaRU'])
  console.log(`  ${dipendenti.length} record trovati.`)

  // --- 2) MIGRAZIONE DEI MANCANTI (solo con --migra-mancanti) ---
  if (MIGRA) {
    console.log('\n=== MIGRAZIONE MANCANTI ===')
    let { perCF, perNome } = costruisciIndici(dipendenti)

    let creati = 0, giaPresenti = 0
    const erroriMigrazione = []
    for (const c of collaboratori) {
      const f = c.fields || {}
      const nome = nomeCompleto(f) || `#${c.id}`
      if (trovaMatch(f, perCF, perNome)) { giaPresenti++; continue } // già coperto: nulla da fare
      try {
        const nuovo = buildNuovoDipendente(f)
        const creato = await graph(token, 'POST', `/sites/${site}/lists/${listDip}/items`, { fields: nuovo })
        creati++
        console.log(`  ✓ creato "${nome}" (nuovo id ${creato.id})`)
      } catch (e) {
        erroriMigrazione.push({ nome, errore: e.message.slice(0, 300) })
        console.error(`  ✗ ERRORE creando "${nome}": ${e.message.slice(0, 300)}`)
      }
    }
    console.log(`\nCreati: ${creati}  |  già coperti: ${giaPresenti}  |  errori: ${erroriMigrazione.length}`)

    // rileggo i Dipendenti per riflettere le creazioni appena fatte nella verifica successiva
    dipendenti = await leggiTuttaLaLista(token, site, listDip, ['Cognome', 'Nome', 'CodiceFiscale', 'CategoriaRU'])
  }

  // --- 3) VERIFICA DI COPERTURA (sempre) ---
  console.log('\n=== VERIFICA DI COPERTURA ===')
  const { perCF, perNome } = costruisciIndici(dipendenti)
  const migrati = []
  const duplicati = []
  const orfani = []
  for (const c of collaboratori) {
    const f = c.fields || {}
    const nome = nomeCompleto(f) || `#${c.id}`
    const match = trovaMatch(f, perCF, perNome)
    if (!match) { orfani.push(nome); continue }
    const categoria = (match.fields || {}).CategoriaRU
    if (categoria === 'Collaboratore') migrati.push(nome)
    else duplicati.push(`${nome} → dipendente esistente "${nomeCompleto(match.fields || {})}"`)
  }

  console.log(`  Migrati in Dipendenti (CategoriaRU=Collaboratore): ${migrati.length}`)
  console.log(`  Già presenti come Dipendente (duplicato): ${duplicati.length}`)
  if (duplicati.length) for (const d of duplicati) console.log(`    ~ ${d}`)
  console.log(`  ORFANI (non rintracciabili in nessun modo): ${orfani.length}`)
  if (orfani.length) for (const nome of orfani) console.log(`    ✗ ${nome}`)

  if (orfani.length > 0) {
    console.log('\n✗ STOP: ci sono record della lista Collaboratori non rintracciabili nella lista Dipendenti.')
    console.log(MIGRA
      ? '  Anche dopo il tentativo di migrazione. Guarda gli errori sopra, correggili a mano sul gestionale e rilancia.'
      : '  Rilancia con --migra-mancanti per tentare di crearli automaticamente.')
    console.log('  Non elimino nulla. Il backup JSON contiene comunque tutti i dati per intero.')
    process.exit(1)
  }

  console.log('\n✓ Tutti i record della lista Collaboratori sono coperti dalla lista Dipendenti.')

  if (!ELIMINA) {
    console.log('\n(Nessuna eliminazione eseguita. Rilancia aggiungendo --conferma-eliminazione per eliminare la lista.)')
    return
  }

  console.log('\n→ Eliminazione della lista Collaboratori su SharePoint...')
  await graph(token, 'DELETE', `/sites/${site}/lists/${listCollab}`)
  console.log('✓ Lista Collaboratori eliminata.')
  console.log('\nPromemoria:')
  console.log('  - rimuovi SP_LIST_COLLABORATORI da .env.local e dalle Environment Variables di Vercel')
  console.log('  - valuta se rimuovere il codice ormai morto in app/(app)/risorse-umane/collaboratori/ e app/api/risorse-umane/collaboratori/')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
