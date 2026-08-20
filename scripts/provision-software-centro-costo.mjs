#!/usr/bin/env node
/**
 * Aggiunge alla lista "Gestione Software" la colonna lookup `CentroCosto`
 * → Centri di Costo.
 *
 * Perché lookup e non testo: il software è una spesa ricorrente e il centro di
 * costo è la dimensione con cui si legge il bilancio. Stessa forma di Costi,
 * Acquisti e Strutture (`CentroCostoLookupId`), così il giorno che si somma la
 * spesa software nel controllo di gestione i numeri combaciano.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-software-centro-costo.mjs            SIMULAZIONE
 *   node scripts/provision-software-centro-costo.mjs --apply    esegue
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_SOFTWARE, SP_LIST_CENTRI_COSTO.
 *
 * Idempotente: se la colonna c'è già non fa nulla.
 *
 * Nota: la colonna resta *facoltativa* su SharePoint. L'obbligo sta nell'app
 * (form + API): le righe già inserite non hanno un centro di costo e SP non
 * lascerebbe più modificarle da interfaccia nativa senza compilarlo.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
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
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

async function main() {
  loadEnvLocal()
  const richieste = [
    'GRAPH_TENANT_ID',
    'GRAPH_CLIENT_ID',
    'GRAPH_CLIENT_SECRET',
    'SHAREPOINT_SITE_ID',
    'SP_LIST_SOFTWARE',
    'SP_LIST_CENTRI_COSTO',
  ]
  for (const k of richieste) if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)

  const site = process.env.SHAREPOINT_SITE_ID
  const listaSoftware = process.env.SP_LIST_SOFTWARE
  const listaCC = process.env.SP_LIST_CENTRI_COSTO
  const token = await getToken()

  console.log('')
  console.log('======================================================================')
  console.log(
    APPLY
      ? 'GESTIONE SOFTWARE — CENTRO DI COSTO — ESECUZIONE'
      : 'GESTIONE SOFTWARE — CENTRO DI COSTO — SIMULAZIONE (aggiungi --apply)',
  )
  console.log('======================================================================')

  // 1) L'anagrafica esiste e ha righe? Se no, il menu del form sarebbe vuoto.
  const cc = await graph(
    token,
    'GET',
    `/sites/${site}/lists/${listaCC}/items?$select=id&$expand=fields($select=Title)&$top=200`,
  )
  const quanti = (cc.value ?? []).length
  console.log(`\nCentri di costo in anagrafica: ${quanti}`)
  if (!quanti) throw new Error('Anagrafica Centri di Costo vuota: prima scripts/provision-centri-costo.mjs')

  // 2) Colonna lookup sulla lista Gestione Software
  console.log('\n1) Colonna CentroCosto su "Gestione Software"')
  const cols = await graph(
    token,
    'GET',
    `/sites/${site}/lists/${listaSoftware}/columns?$select=id,name&$top=200`,
  )
  if ((cols.value ?? []).some((c) => c.name === 'CentroCosto')) {
    console.log('  = già presente, niente da fare')
  } else {
    if (APPLY) {
      await graph(token, 'POST', `/sites/${site}/lists/${listaSoftware}/columns`, {
        name: 'CentroCosto',
        lookup: { listId: listaCC, columnName: 'Title' },
      })
    }
    console.log(`  ${APPLY ? '✓ creata' : '· da creare'}`)
  }

  // 3) Righe già presenti senza centro di costo: si segnalano, non si indovina.
  console.log('\n2) Software già registrati senza centro di costo')
  const items = await graph(
    token,
    'GET',
    `/sites/${site}/lists/${listaSoftware}/items?$select=id&$expand=fields($select=Title,CentroCostoLookupId)&$top=500`,
  )
  const orfani = (items.value ?? []).filter((i) => !Number(i.fields?.CentroCostoLookupId ?? 0))
  if (!orfani.length) {
    console.log('  = nessuno')
  } else {
    for (const o of orfani) console.log(`  ! ${o.fields?.Title ?? `(riga ${o.id})`}`)
    console.log(
      `\n  ${orfani.length} da sistemare a mano dalla sezione Amministrazione → Gestione Software:`,
    )
    console.log('  "Modifica" → scegli il centro di costo → "Salva modifiche".')
  }

  console.log('')
  if (APPLY) {
    console.log('✓ Fatto. Passo successivo: nessuno, il codice dell\'app è già pronto.')
  } else {
    console.log('Nulla è stato modificato. Per eseguire:')
    console.log('  node scripts/provision-software-centro-costo.mjs --apply')
  }
  console.log('')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
