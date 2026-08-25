#!/usr/bin/env node
/**
 * Confronta lo SCHEMA dell'area Risorse Umane (types/risorse-umane.ts) con le
 * colonne che esistono davvero sulle liste SharePoint, e segnala (o crea) le
 * mancanti.
 *
 * PERCHE' SERVE. Al salvataggio di una scheda l'app manda a Graph TUTTI i campi
 * dello schema (buildFields in lib/risorse-umane/data.ts). Se anche una sola
 * colonna non esiste sulla lista, SharePoint rifiuta l'intera PATCH con
 *   400 invalidRequest — Field 'X' is not recognized
 * e quindi NON si riesce piu' a salvare NIENTE su nessuna scheda, nemmeno i
 * campi che invece esistono. E' successo il 21 ago 2026 con `MatricolaPulse` e
 * `DataRestituzioneQuota`, aggiunte allo schema ma mai create sulla lista del
 * sito RU dedicato.
 *
 * Uso (dalla cartella web/):
 *   node scripts/colonne-ru-mancanti.mjs            # solo diagnosi
 *   node scripts/colonne-ru-mancanti.mjs --crea     # crea le colonne mancanti
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SP_SITE_RU (o SHAREPOINT_SITE_ID), SP_LIST_DIPENDENTI, SP_LIST_TIROCINI.
 * Permesso Graph: Sites.ReadWrite.All (Application).
 *
 * Lo schema viene letto a testo, non importato: il file e' TypeScript e qui
 * gira Node puro. Il parser si appoggia ai nomi dei blocchi
 * (ANAGRAFICA_COMUNE, CONTATTI_COMUNE, FORMAZIONE_COMUNE, TIMBRATURE_COMUNE,
 * NOTE_COMUNE, DIPENDENTI_SPECIFICI, TIROCINI_SPECIFICI): se in futuro li
 * rinomini, aggiorna anche BLOCCHI qui sotto.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA = join(__dirname, '..', 'types', 'risorse-umane.ts')

const BLOCCHI_COMUNI = ['ANAGRAFICA_COMUNE', 'CONTATTI_COMUNE', 'FORMAZIONE_COMUNE']
const BLOCCHI_CODA = ['TIMBRATURE_COMUNE']

// ------------------------------------------------------------------
// Definizione colonne SharePoint (deve combaciare con provision-risorse-umane.mjs)
// ------------------------------------------------------------------
const text = (multi = false) => ({ text: { allowMultipleLines: multi } })
const number = () => ({ number: {} })
const currency = () => ({ currency: { locale: 'it-IT' } })
const dateOnly = () => ({ dateTime: { format: 'dateOnly', displayAs: 'standard' } })
const choice = (choices) => ({ choice: { choices, displayAs: 'dropDownMenu', allowTextEntry: true } })

function definizione(campo) {
  switch (campo.type) {
    case 'textarea': return text(true)
    case 'date': return dateOnly()
    case 'number': return number()
    case 'currency': return currency()
    case 'choice': return campo.choices?.length ? choice(campo.choices) : text()
    default: return text() // text, email, tel
  }
}

// ------------------------------------------------------------------
// Lettura dello schema
// ------------------------------------------------------------------
function stringheDi(blocco) {
  return [...blocco.matchAll(/'((?:[^'\\]|\\.)*)'|"([^"]*)"/g)].map((m) => (m[1] ?? m[2]).replace(/\\'/g, "'"))
}

function leggiSchema() {
  const src = readFileSync(SCHEMA, 'utf8')

  // costanti dei menu a tendina: const NOME = [ ... ] as const
  const tendine = {}
  for (const m of src.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*\[([\s\S]*?)\]\s*as const/g)) {
    tendine[m[1]] = stringheDi(m[2])
  }

  const campiDi = (testo) => {
    const out = []
    for (const m of testo.matchAll(/\{\s*key:\s*'([^']+)'[^}]*?type:\s*'([^']+)'([^}]*)\}/g)) {
      const resto = m[3] ?? ''
      const tend = resto.match(/choices:\s*([A-Z0-9_]+)/)
      out.push({ key: m[1], type: m[2], choices: tend ? tendine[tend[1]] : undefined })
    }
    return out
  }

  const blocco = (nome) => {
    const m = src.match(new RegExp(`const\\s+${nome}[^=]*=\\s*(\\[[\\s\\S]*?\\n\\]|\\{[^\\n]*\\})`))
    if (!m) throw new Error(`Blocco "${nome}" non trovato in types/risorse-umane.ts (il parser va aggiornato)`)
    return campiDi(m[1])
  }

  const comuni = [...BLOCCHI_COMUNI, ...BLOCCHI_CODA].flatMap(blocco)
  const note = blocco('NOTE_COMUNE')

  return {
    dipendenti: [...comuni, ...blocco('DIPENDENTI_SPECIFICI'), ...note],
    tirocini: [...comuni, ...blocco('TIROCINI_SPECIFICI'), ...note],
  }
}

// ------------------------------------------------------------------
// Graph
// ------------------------------------------------------------------
function caricaEnv() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const riga of raw.split('\n')) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    // niente .env.local: si usano le variabili d'ambiente
  }
}

async function token() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GRAPH_CLIENT_ID,
        client_secret: process.env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  )
  const d = await res.json()
  if (!res.ok) throw new Error(`Token non ottenuto: ${d.error_description || res.status}`)
  return d.access_token
}

async function graph(tk, metodo, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const testo = await res.text()
  const d = testo ? JSON.parse(testo) : {}
  if (!res.ok) throw new Error(`${metodo} ${path} → ${res.status}: ${d.error?.message || testo}`)
  return d
}

// ------------------------------------------------------------------
async function main() {
  caricaEnv()
  const crea = process.argv.includes('--crea')
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  if (!site) {
    console.error('Manca SP_SITE_RU (o SHAREPOINT_SITE_ID).')
    process.exit(1)
  }

  const schema = leggiSchema()
  const liste = [
    { entita: 'dipendenti', listId: process.env.SP_LIST_DIPENDENTI },
    { entita: 'tirocini', listId: process.env.SP_LIST_TIROCINI },
  ]

  const tk = await token()
  let mancantiTotali = 0

  for (const { entita, listId } of liste) {
    console.log(`\n▸ ${entita}`)
    if (!listId) { console.log('  (lista non configurata in env: salto)'); continue }

    const cols = await graph(tk, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=300`)
    const presenti = new Set((cols.value ?? []).map((c) => c.name))
    const mancanti = schema[entita].filter((c) => !presenti.has(c.key))

    if (!mancanti.length) { console.log('  ✓ tutte le colonne dello schema esistono sulla lista'); continue }

    mancantiTotali += mancanti.length
    for (const campo of mancanti) console.log(`  ✗ manca: ${campo.key} (${campo.type})`)

    if (crea) {
      for (const campo of mancanti) {
        await graph(tk, 'POST', `/sites/${site}/lists/${listId}/columns`, { name: campo.key, ...definizione(campo) })
        console.log(`  + creata: ${campo.key}`)
      }
    }
  }

  console.log('')
  if (!mancantiTotali) console.log('Nessuna colonna mancante: il salvataggio schede non puo\' rompersi per questo motivo.')
  else if (crea) console.log(`Create ${mancantiTotali} colonne. Riprova a salvare una scheda.`)
  else console.log(`${mancantiTotali} colonne mancanti. Per crearle: node scripts/colonne-ru-mancanti.mjs --crea`)
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
