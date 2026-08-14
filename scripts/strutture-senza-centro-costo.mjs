#!/usr/bin/env node
/**
 * Confronto fra l'anagrafica Strutture su SharePoint e le assegnazioni a
 * centro di costo del foglio Aree_e_Centri_di_Costo_Mirafiori_v3.xlsx.
 *
 * Non scrive niente: legge e basta. Serve a sapere che cosa portare in ufficio
 * prima di aggiungere la colonna CentroCosto alla lista Strutture.
 *
 * Uso (dalla cartella web/):
 *   node scripts/strutture-senza-centro-costo.mjs
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_STRUTTURE.
 *
 * Stampa tre elenchi:
 *   1. strutture in anagrafica SENZA centro di costo   → da assegnare in ufficio
 *   2. righe del foglio senza riscontro in anagrafica  → codice o nome sbagliato
 *   3. il quadro completo, struttura per struttura
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Assegnazioni dal foglio v3: codice struttura → centro di costo.
// Il codice è la chiave del confronto perché i nomi nel foglio sono scritti a
// mano e non coincidono sempre con quelli dell'anagrafica ("Comunita Giulia"
// senza accento, "Pian della Mussa " con lo spazio in coda).
const DA_FOGLIO = {
  A01: { cc: 'cc9',  centro: 'CRP CO.S.MI.C.A',                nomeFoglio: 'Cascina (CRP)' },
  A03: { cc: 'cc5',  centro: 'Casa Artemisia',                 nomeFoglio: 'Casa Artemisia' },
  A04: { cc: 'cc17', centro: 'SCAT.TO abitare',                nomeFoglio: 'Alloggio Via Coggiola - Scat.To' },
  A05: { cc: 'cc21', centro: 'Pian della Mussa',               nomeFoglio: 'Pian della Mussa' },
  A07: { cc: 'cc6',  centro: 'Toc Toc Roberto',                nomeFoglio: 'Centro CUAV Via Monte Cengio' },
  B01: { cc: 'cc2',  centro: 'La Locanda nel Parco',           nomeFoglio: 'La Locanda nel Parco' },
  B02: { cc: 'cc17', centro: 'SCAT.TO abitare',                nomeFoglio: 'Alloggio Strada del Drosso' },
  B03: { cc: 'cc14', centro: 'CER Giulia',                     nomeFoglio: 'Comunita Giulia' },
  B04: { cc: 'cc18', centro: 'Condominio Solidale',            nomeFoglio: 'Condominio Solidale Via Gessi' },
  B05: { cc: 'cc8',  centro: 'MirArte',                        nomeFoglio: 'Alloggio Via San Domenico' },
  B06: { cc: 'cc16', centro: 'Ed. amb. Sud',                   nomeFoglio: 'Fleming (Mirafleming)' },
  B07: { cc: 'cc7',  centro: 'CPG Torino',                     nomeFoglio: 'CPG Torino' },
  B08: { cc: 'cc23', centro: 'Progettazione - Amministrazione',nomeFoglio: 'Ufficio Strada del Drosso' },
  B09: { cc: 'cc22', centro: 'Amazing',                        nomeFoglio: 'Magazzino Drosso' },
  B10: { cc: 'cc3',  centro: 'Una Serra per Mirafiori',        nomeFoglio: 'Spazio WOW' },
}

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

async function graph(token, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text}`)
  return JSON.parse(text)
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_STRUTTURE']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const lista = process.env.SP_LIST_STRUTTURE

  const token = await getToken()
  const res = await graph(
    token,
    `/sites/${site}/lists/${lista}/items?$select=id&$expand=fields($select=Title,Codice,StrutturaLabel)&$top=500`,
  )

  const strutture = (res.value || [])
    .map((i) => ({
      codice: (i.fields?.Codice ?? '').trim().toUpperCase(),
      nome: i.fields?.StrutturaLabel || i.fields?.Title || '(senza nome)',
    }))
    .sort((a, b) => a.codice.localeCompare(b.codice, 'it'))

  const codiciAnagrafica = new Set(strutture.map((s) => s.codice))
  const senzaCC = strutture.filter((s) => !DA_FOGLIO[s.codice])
  const nelFoglioMaNonInAnagrafica = Object.keys(DA_FOGLIO).filter((c) => !codiciAnagrafica.has(c))

  console.log('')
  console.log('======================================================================')
  console.log(`STRUTTURE IN ANAGRAFICA: ${strutture.length}   —   ASSEGNATE NEL FOGLIO: ${Object.keys(DA_FOGLIO).length}`)
  console.log('======================================================================')

  console.log('\n1) SENZA CENTRO DI COSTO — da assegnare in ufficio')
  if (!senzaCC.length) {
    console.log('   ✓ nessuna: il foglio copre tutta l\'anagrafica.')
  } else {
    for (const s of senzaCC) console.log(`   ✗ ${(s.codice || '(senza codice)').padEnd(6)} ${s.nome}`)
  }

  console.log('\n2) NEL FOGLIO MA NON IN ANAGRAFICA — codice sbagliato o struttura dismessa')
  if (!nelFoglioMaNonInAnagrafica.length) {
    console.log('   ✓ nessuna: tutte le righe del foglio trovano riscontro.')
  } else {
    for (const c of nelFoglioMaNonInAnagrafica) {
      console.log(`   ✗ ${c.padEnd(6)} ${DA_FOGLIO[c].nomeFoglio}  →  ${DA_FOGLIO[c].centro}`)
    }
  }

  console.log('\n3) QUADRO COMPLETO')
  for (const s of strutture) {
    const m = DA_FOGLIO[s.codice]
    const cc = m ? `${m.cc} ${m.centro}` : '— DA ASSEGNARE —'
    console.log(`   ${(s.codice || '???').padEnd(6)} ${s.nome.padEnd(38)} ${cc}`)
  }
  console.log('')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
