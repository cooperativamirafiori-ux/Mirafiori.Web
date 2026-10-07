#!/usr/bin/env node
/**
 * Chi è un LAVORATORE fra le schede Dipendenti? Serve a decidere se la schermata
 * Responsabili (e l'attivazione delle timbrature) può mostrare solo chi lavora,
 * lasciando fuori soci volontari, fruitori, sovventori ecc.
 *
 * Divide le schede NON cessate in tre gruppi, in base ai campi che ci sono:
 *   - lavoratori: Tipo di rapporto da lavoratore, oppure (se manca) un tipo di
 *     contratto o una matricola;
 *   - non lavoratori: Tipo di rapporto da socio non lavoratore;
 *   - incerti: nessuno di questi dati. Sono quelli da far sistemare alle HR.
 *
 * USO (dalla cartella web/):
 *   node scripts/diagnosi-lavoratori.mjs
 *
 * Sola lettura: non scrive niente su SharePoint.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const CAMPI = [
  'Cognome', 'Nome', 'Matricola', 'TipoRapporto', 'TipoContratto', 'StatoRapporto',
  'DataDimissioneLavoratore', 'MailAziendale', 'TimbraturaAttiva', 'CategoriaRU',
].join(',')

const LAVORATORI = [
  'Dipendente', 'Socio lavoratore', 'Apprendista', 'Libero professionista',
  'Socio libero professionista', 'Collaborazione Coordinate Continuativa',
  'Tirocinante e/o Stagista', 'Volontario in servizio civile',
]
const NON_LAVORATORI = [
  'Socio volontario', 'Socio fruitore', 'Socio persona giuridica', 'Socio sovventore e finanziatore',
]

function caricaEnv() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const riga of raw.split('\n')) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* env già impostate */ }
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(`Token non ottenuto: ${d.error_description || res.status}`)
  return d.access_token
}

async function graph(token, url) {
  const res = await fetch(url.startsWith('http') ? url : `https://graph.microsoft.com/v1.0${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}

const val = (v) => (v == null ? '' : String(v).trim())

function classe(f) {
  const tipo = val(f.TipoRapporto)
  if (LAVORATORI.includes(tipo)) return 'lavoratore'
  if (NON_LAVORATORI.includes(tipo)) return 'non-lavoratore'
  if (val(f.TipoContratto) || val(f.Matricola)) return 'lavoratore'
  return 'incerto'
}

async function main() {
  caricaEnv()
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  const listId = process.env.SP_LIST_DIPENDENTI
  if (!site || !listId) {
    console.error('✗ Mancano SP_SITE_RU (o SHAREPOINT_SITE_ID) e SP_LIST_DIPENDENTI in .env.local')
    process.exit(1)
  }
  const token = await getToken()
  const items = []
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=${CAMPI})&$top=200`
  while (url) {
    const res = await graph(token, url)
    items.push(...(res.value || []))
    url = res['@odata.nextLink'] || null
  }

  const tutte = items.map((it) => it.fields ?? {})
  const cessate = tutte.filter((f) => val(f.StatoRapporto) === 'Cessato' || val(f.DataDimissioneLavoratore))
  const vive = tutte.filter((f) => !cessate.includes(f))

  console.log(`Schede Dipendenti: ${tutte.length} · cessate (stato o data dimissione): ${cessate.length} · restanti: ${vive.length}\n`)

  const perTipo = {}
  for (const f of vive) {
    const k = val(f.TipoRapporto) || '(vuoto)'
    perTipo[k] = (perTipo[k] || 0) + 1
  }
  console.log('Tipo di rapporto delle schede non cessate:')
  for (const [k, n] of Object.entries(perTipo).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`)
  console.log('')

  const gruppi = { lavoratore: [], 'non-lavoratore': [], incerto: [] }
  for (const f of vive) gruppi[classe(f)].push(f)
  const nome = (f) => `${val(f.Cognome)} ${val(f.Nome)}`.trim()
  const riga = (f) => {
    const pezzi = [
      val(f.TipoRapporto) || 'tipo assente',
      val(f.Matricola) ? `matr. ${val(f.Matricola)}` : 'senza matricola',
      val(f.TipoContratto) || null,
      val(f.StatoRapporto) ? `stato ${val(f.StatoRapporto)}` : 'stato vuoto',
      val(f.TimbraturaAttiva) === 'Si' ? 'TIMBRATURA ATTIVA' : null,
    ].filter(Boolean)
    return `  · ${nome(f).padEnd(30)} ${pezzi.join(' · ')}`
  }

  console.log(`LAVORATORI: ${gruppi.lavoratore.length}`)
  console.log(`NON LAVORATORI (soci volontari, fruitori, sovventori…): ${gruppi['non-lavoratore'].length}`)
  const nlAttivi = gruppi['non-lavoratore'].filter((f) => val(f.TimbraturaAttiva) === 'Si')
  if (nlAttivi.length) {
    console.log('  ⚠️ di cui con la timbratura attiva:')
    for (const f of nlAttivi) console.log(riga(f))
  }
  console.log(`INCERTI (né tipo di rapporto, né contratto, né matricola): ${gruppi.incerto.length}`)
  for (const f of gruppi.incerto.sort((a, b) => nome(a).localeCompare(nome(b), 'it'))) console.log(riga(f))
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
