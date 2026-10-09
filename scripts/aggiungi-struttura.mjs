#!/usr/bin/env node
/**
 * Aggiunge una struttura all'anagrafica Strutture (SharePoint) agganciata a un
 * centro di costo, con indirizzo e dati catastali, e mette il suo POD nella
 * lista "Mappatura Utenze" (100% sulla struttura): è lì che l'area Utenze lo
 * cerca per agganciare le bollette. Il POD NON va in una colonna delle
 * Strutture: sarebbero due elenchi dei contatori destinati a divergere.
 *
 * Idempotente:
 *   - crea le colonne Comune/Foglio/Particella/Subalterno solo se mancano
 *     (non tocca né toglie nessuna colonna esistente);
 *   - se il codice struttura esiste già non crea doppioni, e il POD si
 *     aggiunge alla Mappatura solo se non c'è.
 *
 * Codice: se non lo indichi, prende il primo libero nella stessa serie (A/B…)
 * della struttura che già appartiene al centro di costo (Casa Artemisia = A03).
 *
 * Uso (dalla cartella web/):
 *   node scripts/aggiungi-struttura.mjs            SIMULAZIONE, non scrive
 *   node scripts/aggiungi-struttura.mjs --apply    scrive su SharePoint
 *
 * Per una prossima struttura: cambia il blocco NUOVA qui sotto.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const NUOVA = {
  centroCosto: 'Casa Artemisia',          // Title nella lista Centri di Costo
  codice: 'B11',                          // vuoto = primo libero nella serie
  titolo: 'Alloggio Poirino',
  Indirizzo: 'Via Giovanni Alfazio 5, Alloggio 3',
  Comune: 'Poirino (TO)',
  Foglio: '43',
  Particella: '288',
  Subalterno: '3',
  POD: 'IT001E02903356',
}

const COLONNE = ['Indirizzo', 'Comune', 'Foglio', 'Particella', 'Subalterno']

const APPLY = process.argv.includes('--apply')
const __dirname = dirname(fileURLToPath(import.meta.url))

try {
  const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const E = process.env
for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_STRUTTURE', 'SP_LIST_CENTRI_COSTO', 'SP_LIST_MAPPATURA_UTENZE']) {
  if (!E[k]) { console.error(`Manca ${k} in .env.local`); process.exit(1) }
}

const tok = await fetch(`https://login.microsoftonline.com/${E.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: E.GRAPH_CLIENT_ID, client_secret: E.GRAPH_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
})
if (!tok.ok) throw new Error(`Token ${tok.status}: ${await tok.text()}`)
const token = (await tok.json()).access_token

async function graph(method, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

const site = E.SHAREPOINT_SITE_ID
const LS = `/sites/${site}/lists/${E.SP_LIST_STRUTTURE}`
const LCC = `/sites/${site}/lists/${E.SP_LIST_CENTRI_COSTO}`
const LMU = `/sites/${site}/lists/${E.SP_LIST_MAPPATURA_UTENZE}`
const norm = (c) => String(c ?? '').toUpperCase().replace(/[\s.\-_/]/g, '')

// POD già in Mappatura Utenze?
const mappatura = (await graph('GET', `${LMU}/items?$expand=fields($select=Title,StrutturaLookupId,Percentuale)&$top=999`)).value
const podInMappatura = mappatura.find((m) => norm(m.fields.Title) === norm(NUOVA.POD))

// 1. centro di costo
const cc = (await graph('GET', `${LCC}/items?$expand=fields($select=Title,Codice)&$top=200`)).value
const centro = cc.find((i) => i.fields.Title.trim().toLowerCase() === NUOVA.centroCosto.toLowerCase())
if (!centro) { console.error(`Centro di costo "${NUOVA.centroCosto}" non trovato`); process.exit(1) }
console.log(`Centro di costo: ${centro.fields.Codice} ${centro.fields.Title} (id ${centro.id})`)

// 2. strutture esistenti
const strutture = (await graph('GET', `${LS}/items?$expand=fields&$top=500`)).value
const doppione = strutture.find((s) => s.fields.Codice === NUOVA.codice || (s.fields.Title ?? '').trim().toLowerCase() === NUOVA.titolo.toLowerCase())

const sorelle = strutture.filter((s) => String(s.fields.CentroCostoLookupId ?? '') === String(centro.id))
console.log(`Strutture già sul centro di costo: ${sorelle.map((s) => `${s.fields.Codice} ${s.fields.Title}`).join(', ') || 'nessuna'}`)

let codice = NUOVA.codice
if (!codice) {
  const serie = (sorelle[0]?.fields.Codice ?? 'A').match(/^[A-Z]+/)[0]
  const usati = strutture.map((s) => s.fields.Codice ?? '').filter((c) => c.startsWith(serie)).map((c) => Number(c.slice(serie.length)) || 0)
  codice = serie + String(Math.max(0, ...usati) + 1).padStart(2, '0')
}
if (doppione) console.log(`Struttura già presente: ${doppione.fields.Codice} ${doppione.fields.Title} (id ${doppione.id}) — non la ricreo.`)
if (podInMappatura) console.log(`POD ${NUOVA.POD} già in Mappatura Utenze (riga ${podInMappatura.id}, struttura ${podInMappatura.fields.StrutturaLookupId ?? '—'}) — non lo riaggiungo.`)
else console.log(`Mappatura Utenze: aggiungo ${NUOVA.POD} · Energia elettrica · 100% su ${codice}`)

// 3. colonne
const esistenti = new Set((await graph('GET', `${LS}/columns?$select=name&$top=200`)).value.map((c) => c.name))
const mancanti = COLONNE.filter((c) => !esistenti.has(c))
console.log(`Colonne da creare: ${mancanti.join(', ') || 'nessuna'}`)

const campi = { Title: NUOVA.titolo, Codice: codice, CentroCostoLookupId: String(centro.id) }
for (const c of COLONNE) campi[c] = NUOVA[c]
if (doppione) delete campi.Codice
console.log('Nuova struttura:', campi)

if (!APPLY) { console.log('\nSIMULAZIONE. Per scrivere: node scripts/aggiungi-struttura.mjs --apply'); process.exit(0) }

let idStruttura = doppione?.id
if (!doppione) {
  for (const c of mancanti) {
    await graph('POST', `${LS}/columns`, { name: c, displayName: c, text: {} })
    console.log(`  + colonna ${c}`)
  }
  const creato = await graph('POST', `${LS}/items`, { fields: campi })
  idStruttura = creato.id
  console.log(`\nCreata: ${codice} ${NUOVA.titolo} (id ${creato.id})`)
}
if (!podInMappatura && NUOVA.POD) {
  const r = await graph('POST', `${LMU}/items`, {
    fields: {
      Title: NUOVA.POD,
      TipoFornitura: 'Energia elettrica',
      StrutturaLookupId: Number(idStruttura),
      CodiceStrutturaLookupId: Number(idStruttura),
      Percentuale: 100,
    },
  })
  console.log(`Mappatura Utenze: aggiunto ${NUOVA.POD} (riga ${r.id}). Se ci sono già sue bollette "da collegare", premi "Rileggi" o collegale dalla pagina Utenze.`)
}
