#!/usr/bin/env node
/**
 * Mostra CHI ha creato e modificato gli item delle liste Risorse Umane, secondo
 * il log nativo di SharePoint.
 *
 * È la verifica dell'obiettivo dell'intero lavoro sull'accesso delegato
 * (docs/piano-ru-sito-dedicato-accesso-delegato.md): con l'identità applicativa
 * "Modificato da" riporta il nome dell'app, con l'identità dell'utente riporta
 * la persona reale. Questo script legge quella colonna senza aprire SharePoint.
 *
 * Uso (da web/):
 *   node scripts/ru-chi-ha-scritto.mjs                 ultime 10 modifiche per lista
 *   node scripts/ru-chi-ha-scritto.mjs --n=30          quante righe mostrare
 *   node scripts/ru-chi-ha-scritto.mjs --versioni=<id> cronologia di un item
 *
 * Il sito e le liste seguono l'assetto attivo in .env.local
 * (vedi scripts/ru-assetto.mjs). Legge con identità applicativa: qui serve solo
 * a ispezionare i metadati, non a scrivere.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    // Nota: qui vince l'ULTIMA occorrenza, come fa dotenv nell'app — così lo
    // script vede esattamente gli stessi valori del server.
    const trovate = {}
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      trovate[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    for (const [k, v] of Object.entries(trovate)) {
      if (process.env[k] === undefined) process.env[k] = v
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

async function graph(token, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : {}
}

/** displayName dell'autore, distinguendo persona da applicazione. */
function autore(identita) {
  if (!identita) return '—'
  if (identita.user?.displayName) return identita.user.displayName
  if (identita.application?.displayName) return `[app] ${identita.application.displayName}`
  return '—'
}

const quando = (iso) => (iso ? iso.slice(0, 16).replace('T', ' ') : '—')

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  if (!site) throw new Error('Nessun sito configurato (SP_SITE_RU o SHAREPOINT_SITE_ID)')
  const assetto = process.env.SP_SITE_RU ? 'B (sito RU dedicato, identità utente)' : 'A (Controllo di Gestione, identità app)'

  const n = Number(process.argv.find((a) => a.startsWith('--n='))?.slice(4)) || 10
  const versioniDi = process.argv.find((a) => a.startsWith('--versioni='))?.slice(11)

  const token = await getToken()

  const liste = [
    ['Dipendenti', process.env.SP_LIST_DIPENDENTI],
    ['Tirocini', process.env.SP_LIST_TIROCINI],
  ].filter(([, id]) => id)

  console.log(`\nAssetto: ${assetto}`)
  console.log(`Sito:    ${site}\n`)

  // --- cronologia versioni di un singolo item ------------------------------
  if (versioniDi) {
    const listId = liste[0]?.[1]
    if (!listId) throw new Error('Nessuna lista configurata')
    const res = await graph(
      token,
      `/sites/${site}/lists/${listId}/items/${versioniDi}/versions?$select=id,lastModifiedBy,lastModifiedDateTime`,
    )
    console.log(`Cronologia versioni dell'item ${versioniDi} (lista ${liste[0][0]}):\n`)
    console.log('Versione'.padEnd(12) + 'Quando'.padEnd(20) + 'Chi')
    console.log('-'.repeat(12) + '-'.repeat(20) + '-'.repeat(34))
    for (const v of res.value || []) {
      console.log(
        String(v.id).padEnd(12) + quando(v.lastModifiedDateTime).padEnd(20) + autore(v.lastModifiedBy),
      )
    }
    console.log('\nSe le versioni sono meno delle modifiche fatte, il versioning è')
    console.log('stato attivato dopo: conserva solo ciò che è successo da allora.\n')
    return
  }

  // --- ultime modifiche per lista ------------------------------------------
  for (const [nome, listId] of liste) {
    let res
    try {
      res = await graph(
        token,
        `/sites/${site}/lists/${listId}/items?$select=id,createdBy,createdDateTime,lastModifiedBy,lastModifiedDateTime` +
          `&$expand=fields($select=Title)&$orderby=lastModifiedDateTime desc&$top=${n}`,
      )
    } catch (e) {
      console.log(`✗ ${nome}: ${e.message}\n`)
      continue
    }
    const items = res.value || []
    console.log(`\x1b[1m${nome}\x1b[0m — ${items.length} righe più recenti`)
    if (!items.length) {
      console.log('  (lista vuota)\n')
      continue
    }
    console.log(
      '  ' + 'Id'.padEnd(6) + 'Nominativo'.padEnd(26) + 'Modificato'.padEnd(18) + 'Da'.padEnd(30) + 'Creato da',
    )
    console.log('  ' + '-'.repeat(6 + 26 + 18 + 30 + 30))
    for (const it of items) {
      console.log(
        '  ' +
          String(it.id).padEnd(6) +
          String(it.fields?.Title ?? '—').slice(0, 25).padEnd(26) +
          quando(it.lastModifiedDateTime).padEnd(18) +
          autore(it.lastModifiedBy).slice(0, 29).padEnd(30) +
          autore(it.createdBy),
      )
    }
    console.log('')
  }

  console.log('Come leggerlo:')
  console.log('  un nome di persona   → la scrittura è avvenuta in delegato: obiettivo raggiunto')
  console.log('  "[app] App Mirafiori" → identità applicativa: assetto A, oppure un percorso')
  console.log('                          di codice che non passa da graphRU()')
  console.log('\nCronologia di un item:  node scripts/ru-chi-ha-scritto.mjs --versioni=<id>\n')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
