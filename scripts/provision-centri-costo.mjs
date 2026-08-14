#!/usr/bin/env node
/**
 * Provisioning della lista SharePoint "Centri di Costo".
 *
 * Crea la lista (se non esiste), aggiunge le colonne mancanti e carica i 23
 * centri di costo approvati (Aree_e_Centri_di_Costo_Mirafiori_v3.xlsx).
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-centri-costo.mjs
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SHAREPOINT_SITE_ID
 *
 * Permesso Graph necessario: Sites.ReadWrite.All (Application) — già presente.
 *
 * Idempotente su tutti e tre i fronti: lista, colonne e righe. Le righe si
 * riconoscono dal `Codice` (cc1…cc23), quindi rilanciarlo non crea doppioni e
 * non tocca i centri di costo già presenti — nemmeno se qualcuno li ha nel
 * frattempo rinominati o gli ha assegnato un responsabile a mano.
 *
 * Al termine stampa la riga SP_LIST_CENTRI_COSTO=... da incollare in .env.local
 * e su Vercel: da quel momento la Richiesta Fattura passa da sé da campo libero
 * a menù a tendina (vedi lib/fatture/centri-di-costo.ts).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const LIST_NAME = 'Centri di Costo'

// Le aree sono una colonna Choice e non una seconda lista: non hanno campi
// propri e una lista in più sarebbe solo un lookup in più da mantenere.
// Nel foglio l'area delle autonomie è scritta "Area Autonomie (tipicamente
// progetti)": la parentesi è una nota di lettura, non fa parte del nome.
const AREE = [
  'Lavoro',
  'Ristorazione',
  'Pari opportunità',
  'Area Socio-Culturale',
  'Area Socio Sanitaria',
  'Area Educativa',
  'Area Autonomie',
  'Ricettività',
  'Commercio',
  'Servizi Generali',
]

// Title = nome del centro di costo. È il campo che i lookup delle altre liste
// (costi, acquisti, fatture) mostrano all'utente: ci va la cosa che si sceglie
// dal menù, non l'area né il codice.
const COLUMNS = [
  // Chiave stabile: è quella che useremo per agganciare i servizi delle
  // timbrature su Supabase, dove l'id numerico di SharePoint non ha senso.
  { name: 'Codice', text: {}, indexed: true },
  { name: 'Area', choice: { choices: AREE, displayAs: 'dropDownMenu' } },
  // Volutamente vuota: i responsabili si assegnano dopo, dall'interfaccia SP.
  { name: 'Responsabile', personOrGroup: { allowMultipleSelection: false } },
  // Un centro di costo non si cancella mai — lo storico dei costi lo referenzia.
  // Quando non serve più si mette Attivo = No e sparisce dai menù.
  { name: 'Attivo', boolean: {} },
  { name: 'Ordine', number: { decimalPlaces: 'none' } },
]

// I 23 centri di costo, nell'ordine del foglio. `Ordine` viene calcolato a
// passi di 10 così si può infilare un centro di costo nuovo in mezzo senza
// rinumerare tutto.
const SEED = [
  { codice: 'cc1',  area: 'Lavoro',                nome: 'Scat.to Orientamento lavoro' },
  { codice: 'cc2',  area: 'Ristorazione',          nome: 'La Locanda nel Parco' },
  { codice: 'cc3',  area: 'Ristorazione',          nome: 'Una Serra per Mirafiori' },
  { codice: 'cc4',  area: 'Pari opportunità',      nome: 'CAV In Rete' },
  { codice: 'cc5',  area: 'Pari opportunità',      nome: 'Casa Artemisia' },
  { codice: 'cc6',  area: 'Pari opportunità',      nome: 'Toc Toc Roberto' },
  { codice: 'cc7',  area: 'Area Socio-Culturale',  nome: 'CPG Torino' },
  { codice: 'cc8',  area: 'Area Socio-Culturale',  nome: 'MirArte' },
  { codice: 'cc9',  area: 'Area Socio Sanitaria',  nome: 'CRP CO.S.MI.C.A' },
  { codice: 'cc10', area: 'Area Socio Sanitaria',  nome: 'Salute Mentale ASL TO' },
  { codice: 'cc11', area: 'Area Socio Sanitaria',  nome: 'Educativa Sanitaria ASL TO5' },
  { codice: 'cc12', area: 'Area Socio Sanitaria',  nome: 'Interventi CDSR Fondazione OZ' },
  { codice: 'cc13', area: 'Area Socio Sanitaria',  nome: 'Progetto Ponte' },
  { codice: 'cc14', area: 'Area Educativa',        nome: 'CER Giulia' },
  { codice: 'cc15', area: 'Area Educativa',        nome: 'Ed. amb. Nord' },
  { codice: 'cc16', area: 'Area Educativa',        nome: 'Ed. amb. Sud' },
  { codice: 'cc17', area: 'Area Autonomie',        nome: 'SCAT.TO abitare' },
  { codice: 'cc18', area: 'Area Autonomie',        nome: 'Condominio Solidale' },
  { codice: 'cc19', area: 'Area Autonomie',        nome: 'Care Leavers' },
  { codice: 'cc20', area: 'Area Autonomie',        nome: 'CISA 12 Nichelino' },
  { codice: 'cc21', area: 'Ricettività',           nome: 'Pian della Mussa' },
  { codice: 'cc22', area: 'Commercio',             nome: 'Amazing' },
  { codice: 'cc23', area: 'Servizi Generali',      nome: 'Progettazione - Amministrazione' },
]

// --- carica .env.local se le env non sono già nell'ambiente ---
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      const val = m[2].replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // .env.local assente: si presume env già impostate
  }
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(
    `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: GRAPH_CLIENT_ID,
        client_secret: GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  )
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

async function graph(token, method, path, body, extraHeaders = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

async function main() {
  loadEnvLocal()
  const site = process.env.SHAREPOINT_SITE_ID
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  console.log('→ Autenticazione Graph...')
  const token = await getToken()

  console.log(`→ Controllo se la lista "${LIST_NAME}" esiste già...`)
  const existing = await graph(token, 'GET', `/sites/${site}/lists?$select=id,displayName&$top=200`)
  const found = (existing.value || []).find((l) => l.displayName === LIST_NAME)

  let listId
  if (found) {
    console.log(`✓ La lista esiste già. ID = ${found.id}`)
    listId = found.id
    await ensureColumns(token, site, listId)
  } else {
    console.log('→ Creazione lista + colonne...')
    const created = await graph(token, 'POST', `/sites/${site}/lists`, {
      displayName: LIST_NAME,
      list: { template: 'genericList' },
      columns: COLUMNS,
    })
    listId = created.id
    console.log(`✓ Lista creata. ID = ${listId}`)
  }

  await seedRighe(token, site, listId)
  printEnv(listId)
}

/** Aggiunge alla lista esistente le sole colonne mancanti (idempotente) */
async function ensureColumns(token, site, listId) {
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
  const present = new Set((cols.value || []).map((c) => c.name))
  const mancanti = COLUMNS.filter((c) => !present.has(c.name))
  if (!mancanti.length) {
    console.log('✓ Tutte le colonne sono già presenti.')
    return
  }
  for (const col of mancanti) {
    await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, col)
    console.log(`  + colonna aggiunta: ${col.name}`)
  }
}

/** Carica i centri di costo mancanti, riconoscendoli dal Codice (idempotente) */
async function seedRighe(token, site, listId) {
  console.log('→ Controllo i centri di costo già presenti...')
  const res = await graph(
    token,
    'GET',
    `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=Title,Codice)&$top=500`,
    undefined,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
  )
  const presenti = new Set(
    (res.value || []).map((i) => (i.fields?.Codice ?? '').trim().toLowerCase()).filter(Boolean),
  )

  const mancanti = SEED.filter((cc) => !presenti.has(cc.codice))
  if (!mancanti.length) {
    console.log(`✓ Tutti i ${SEED.length} centri di costo sono già in lista.`)
    return
  }

  console.log(`→ Inserimento di ${mancanti.length} centri di costo...`)
  for (const cc of mancanti) {
    const ordine = (SEED.indexOf(cc) + 1) * 10
    await graph(token, 'POST', `/sites/${site}/lists/${listId}/items`, {
      fields: {
        Title: cc.nome,
        Codice: cc.codice,
        Area: cc.area,
        Attivo: true,
        Ordine: ordine,
      },
    })
    console.log(`  + ${cc.codice.padEnd(5)} ${cc.nome}`)
  }
  console.log(`✓ Inseriti ${mancanti.length} centri di costo.`)
}

function printEnv(id) {
  console.log('\n============================================================')
  console.log('Aggiungi questa riga a .env.local e alle Environment Variables su Vercel:')
  console.log(`\n  SP_LIST_CENTRI_COSTO=${id}\n`)
  console.log('Da quel momento la Richiesta Fattura mostra il menù a tendina.')
  console.log('I Responsabili restano vuoti: si assegnano dalla lista su SharePoint.')
  console.log('============================================================')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
