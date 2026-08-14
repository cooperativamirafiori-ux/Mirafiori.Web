#!/usr/bin/env node
/**
 * Collega i centri di costo alle liste che li devono usare.
 *
 * Tre cose, in quest'ordine:
 *
 *   1. aggiunge la colonna lookup `CentroCosto` → Centri di Costo alle liste
 *      Strutture, Costi e Richieste Acquisto;
 *   2. assegna a ogni struttura il suo centro di costo, dal foglio v3;
 *   3. toglie l'obbligatorietà a `Struttura` sulla lista Costi.
 *
 * Il punto 3 è il cambio di modello vero: oggi un costo esiste solo se appeso a
 * un muro, ma nove centri di costo su ventitré non hanno nessuna sede fisica
 * (l'educativa nelle scuole, Care Leavers, CISA 12, il CAV…). Da qui in avanti
 * la dimensione contabile obbligatoria è il centro di costo; la struttura resta
 * un'informazione logistica, e quando c'è precompila il centro di costo.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-centri-costo-collegamenti.mjs            SIMULAZIONE
 *   node scripts/provision-centri-costo-collegamenti.mjs --apply    esegue
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_CENTRI_COSTO, SP_LIST_STRUTTURE, SP_LIST_COSTI,
 * SP_LIST_ACQUISTI.
 *
 * Idempotente: le colonne già presenti non si ricreano, le strutture già
 * assegnate non si ritoccano.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

/**
 * Assegnazione struttura → centro di costo, dal foglio v3.
 * Chiave: il codice della struttura (A01, B10…), non il nome — nel foglio i
 * nomi sono scritti a mano e non combaciano con l'anagrafica.
 *
 * A02 e A06 non compaiono: sono state unificate in A01 e A05 il 14/08/2026
 * (vedi scripts/unifica-strutture.mjs).
 */
const STRUTTURA_CC = {
  A01: 'cc9',   // Cascina (CRP)                  → CRP CO.S.MI.C.A
  A03: 'cc5',   // Casa Artemisia                 → Casa Artemisia
  A04: 'cc17',  // Alloggio Via Coggiola          → SCAT.TO abitare
  A05: 'cc21',  // Pian della Mussa               → Pian della Mussa
  A07: 'cc6',   // Centro CUAV Via Monte Cengio   → Toc Toc Roberto
  B01: 'cc2',   // La Locanda nel Parco           → La Locanda nel Parco
  B02: 'cc17',  // Alloggio Strada del Drosso     → SCAT.TO abitare
  B03: 'cc14',  // Comunità Giulia                → CER Giulia
  B04: 'cc18',  // Condominio Solidale Via Gessi  → Condominio Solidale
  B05: 'cc8',   // Alloggio Via San Domenico      → MirArte
  B06: 'cc16',  // Fleming (Mirafleming)          → Ed. amb. Sud
  B07: 'cc7',   // CPG Torino                     → CPG Torino
  B08: 'cc23',  // Ufficio Strada del Drosso      → Progettazione - Amministrazione
  B09: 'cc22',  // Magazzino Drosso               → Amazing
  B10: 'cc3',   // Spazio WOW                     → Una Serra per Mirafiori
}

/** Liste che ricevono la colonna lookup CentroCosto. */
const LISTE_DA_COLLEGARE = [
  { etichetta: 'Strutture', env: 'SP_LIST_STRUTTURE' },
  { etichetta: 'Costi',     env: 'SP_LIST_COSTI' },
  { etichetta: 'Acquisti',  env: 'SP_LIST_ACQUISTI' },
]

// --- impianto ---------------------------------------------------------------

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
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`
  const res = await fetch(url, {
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

async function tuttiGliItem(token, path) {
  const fuori = []
  let next = path
  while (next) {
    const res = await graph(token, 'GET', next)
    fuori.push(...(res.value || []))
    next = res['@odata.nextLink'] || null
  }
  return fuori
}

// --- lavoro -----------------------------------------------------------------

async function main() {
  loadEnvLocal()
  const richieste = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_CENTRI_COSTO', ...LISTE_DA_COLLEGARE.map((l) => l.env)]
  for (const k of richieste) if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)

  const site = process.env.SHAREPOINT_SITE_ID
  const listaCC = process.env.SP_LIST_CENTRI_COSTO
  const token = await getToken()

  console.log('')
  console.log('======================================================================')
  console.log(APPLY ? 'CENTRI DI COSTO — COLLEGAMENTI — ESECUZIONE' : 'CENTRI DI COSTO — COLLEGAMENTI — SIMULAZIONE (aggiungi --apply)')
  console.log('======================================================================')

  // --- 1. anagrafica centri di costo ---------------------------------------
  const ccItems = await tuttiGliItem(
    token,
    `/sites/${site}/lists/${listaCC}/items?$select=id&$expand=fields($select=Title,Codice)&$top=200`,
  )
  const ccPerCodice = new Map()
  for (const i of ccItems) {
    const cod = (i.fields?.Codice ?? '').trim().toLowerCase()
    if (cod) ccPerCodice.set(cod, { id: Number(i.id), nome: i.fields?.Title ?? '' })
  }
  console.log(`\nCentri di costo in lista: ${ccPerCodice.size}`)

  const ccMancanti = [...new Set(Object.values(STRUTTURA_CC))].filter((c) => !ccPerCodice.has(c))
  if (ccMancanti.length) throw new Error(`Centri di costo non trovati: ${ccMancanti.join(', ')}`)

  // --- 2. colonna lookup sulle tre liste ------------------------------------
  console.log('\n1) Colonna CentroCosto')
  for (const l of LISTE_DA_COLLEGARE) {
    const lista = process.env[l.env]
    const cols = await graph(token, 'GET', `/sites/${site}/lists/${lista}/columns?$select=name&$top=200`)
    if ((cols.value || []).some((c) => c.name === 'CentroCosto')) {
      console.log(`  = ${l.etichetta}: già presente`)
      continue
    }
    if (APPLY) {
      await graph(token, 'POST', `/sites/${site}/lists/${lista}/columns`, {
        name: 'CentroCosto',
        lookup: { listId: listaCC, columnName: 'Title' },
      })
    }
    console.log(`  ${APPLY ? '✓' : '·'} ${l.etichetta}: colonna lookup da aggiungere`)
  }

  // --- 3. assegnazione alle strutture ---------------------------------------
  console.log('\n2) Assegnazione centro di costo alle strutture')
  const listaStrutture = process.env.SP_LIST_STRUTTURE
  const strutture = await tuttiGliItem(
    token,
    `/sites/${site}/lists/${listaStrutture}/items?$select=id&$expand=fields($select=Title,Codice,CentroCostoLookupId)&$top=500`,
  )

  let assegnate = 0
  let daAssegnare = 0
  for (const s of strutture.sort((a, b) => (a.fields?.Codice ?? '').localeCompare(b.fields?.Codice ?? '', 'it'))) {
    const cod = (s.fields?.Codice ?? '').trim().toUpperCase()
    const nome = s.fields?.Title ?? ''
    const atteso = STRUTTURA_CC[cod]

    if (!atteso) {
      // Strutture archiviate (ZZ_) o non previste dal foglio: si saltano e si
      // segnalano, non si indovina.
      console.log(`  ? ${cod.padEnd(5)} ${nome.padEnd(42)} nessuna assegnazione nel foglio`)
      continue
    }

    const cc = ccPerCodice.get(atteso)
    const attuale = Number(s.fields?.CentroCostoLookupId ?? 0)
    if (attuale === cc.id) {
      console.log(`  = ${cod.padEnd(5)} ${nome.padEnd(42)} ${cc.nome}`)
      assegnate++
      continue
    }
    daAssegnare++
    if (APPLY) {
      await graph(token, 'PATCH', `/sites/${site}/lists/${listaStrutture}/items/${s.id}/fields`, {
        CentroCostoLookupId: cc.id,
      })
    }
    console.log(`  ${APPLY ? '✓' : '·'} ${cod.padEnd(5)} ${nome.padEnd(42)} → ${cc.nome}`)
  }

  // --- 4. Struttura non più obbligatoria sui Costi --------------------------
  console.log('\n3) Obbligatorietà di Struttura sulla lista Costi')
  const listaCosti = process.env.SP_LIST_COSTI
  const colsCosti = await graph(token, 'GET', `/sites/${site}/lists/${listaCosti}/columns?$select=id,name,required&$top=200`)
  const colStruttura = (colsCosti.value || []).find((c) => c.name === 'Struttura')
  if (!colStruttura) {
    console.log('  ! colonna Struttura non trovata sulla lista Costi')
  } else if (!colStruttura.required) {
    console.log('  = già facoltativa')
  } else {
    if (APPLY) {
      await graph(token, 'PATCH', `/sites/${site}/lists/${listaCosti}/columns/${colStruttura.id}`, { required: false })
    }
    console.log(`  ${APPLY ? '✓' : '·'} da rendere facoltativa`)
  }

  console.log('')
  if (APPLY) {
    console.log(`✓ Fatto. Strutture già a posto: ${assegnate}, aggiornate: ${daAssegnare}.`)
    console.log('  Passo successivo: il codice dell\'app (lib/costi, lib/strutture, i form).')
  } else {
    console.log(`Strutture già a posto: ${assegnate}, da aggiornare: ${daAssegnare}. Nulla è stato modificato.`)
    console.log('Per eseguire:  node scripts/provision-centri-costo-collegamenti.mjs --apply')
  }
  console.log('')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
