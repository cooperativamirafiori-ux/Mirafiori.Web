#!/usr/bin/env node
/**
 * Provisioning della sezione Preventivi su SharePoint.
 *
 * Crea (se mancano) le quattro liste con le loro colonne:
 *   - "Preventivi"            → SP_LIST_PREVENTIVI
 *   - "Tariffario Preventivi" → SP_LIST_TARIFFARIO_PREVENTIVI
 *   - "Contatti Preventivi"   → SP_LIST_CONTATTI_PREVENTIVI
 *   - "Enti Preventivi"       → SP_LIST_ENTI_PREVENTIVI (20/11/2026)
 * e trova il drive del sito "docs", dove sta la cartella Preventivi di Andrea
 *   → SP_PREVENTIVI_DRIVE_ID
 *
 * Le tariffe e gli enti NON li semina più questo script: dal 20/11/2026 li
 * carica scripts/preventivi-carica-matrice.mjs dalla matrice di Andrea.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-preventivi.mjs
 *
 * Idempotente: le liste esistenti ricevono solo le colonne mancanti. Le
 * colonne di prima (Bloccato, PrezzoMin, PrezzoMax, Modelli, Ambito, Modello)
 * restano sulle liste ma l'app non le usa più.
 * Alla fine scrive da sé le variabili in .env.local; su Vercel le porta
 * scripts/preventivi-env-vercel.sh.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SITO_DOCS = 'coopmirafiorionlus.sharepoint.com:/sites/docs'

const testo = (name) => ({ name, text: {} })
const testoLungo = (name) => ({ name, text: { allowMultipleLines: true, textType: 'plain' } })
const numero = (name) => ({ name, number: {} })
const giorno = (name) => ({ name, dateTime: { format: 'dateOnly', displayAs: 'standard' } })
const momento = (name) => ({ name, dateTime: { format: 'dateTime', displayAs: 'standard' } })
const spunta = (name) => ({ name, boolean: {} })

// I nomi DEVONO coincidere con quelli di lib/preventivi/data.ts
const LISTE = [
  {
    env: 'SP_LIST_PREVENTIVI',
    nome: 'Preventivi',
    colonne: [
      numero('Anno'), numero('Progressivo'), numero('Revisione'),
      testo('Modello'), testo('CentroCosto'), testo('CentroCostoNome'), testo('Cartella'), testo('Ambito'),
      testo('Servizio'), testo('Sottotipo'), testo('EnteScelta'), testoLungo('Destinatari'),
      numero('DurataMesi'), spunta('Maggiorazione'), testoLungo('Referente2'),
      testo('EnteDestinatario'), testo('DestinatarioNome'), testo('DestinatarioRuolo'), testo('DestinatarioEmail'),
      testo('Beneficiario'), testo('Oggetto'), testo('TipoProgetto'), testo('Ripartizione'),
      giorno('PeriodoDal'), giorno('PeriodoAl'),
      testoLungo('Righe'), numero('TotaleMensile'),
      testo('Stato'), testo('CreatoDa'), testo('CreatoDaNome'),
      momento('EmessoIl'), giorno('EsitoIl'), testo('EsitoDa'), testoLungo('NotaEsito'),
      testo('PdfUrl'), testo('PrecedenteId'), momento('UltimoSollecito'), testoLungo('Note'),
    ],
  },
  {
    env: 'SP_LIST_TARIFFARIO_PREVENTIVI',
    nome: 'Tariffario Preventivi',
    colonne: [
      testo('Codice'), testo('Gruppo'), testo('Unita'), numero('Prezzo'), spunta('Bloccato'),
      numero('PrezzoMin'), numero('PrezzoMax'), testo('RegimeIva'), testo('Modelli'), testo('Ambito'),
      giorno('ValidoDal'), giorno('ValidoAl'), numero('Ordine'), testoLungo('Note'),
      testo('Servizio'), testo('Sottotipo'), testo('Ente'),
    ],
  },
  {
    env: 'SP_LIST_CONTATTI_PREVENTIVI',
    nome: 'Contatti Preventivi',
    colonne: [testo('Ruolo'), testo('Ente'), testo('Email'), testo('Telefono')],
  },
  {
    env: 'SP_LIST_ENTI_PREVENTIVI',
    nome: 'Enti Preventivi',
    colonne: [testo('Chiave'), testo('Servizi'), spunta('Attivo'), testoLungo('Note')],
  },
]

// ------------------------------------------------------------

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
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
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

async function assicuraLista(token, site, esistenti, l) {
  const trovata = esistenti.find((x) => x.displayName === l.nome)
  if (!trovata) {
    const creata = await graph(token, 'POST', `/sites/${site}/lists`, {
      displayName: l.nome,
      list: { template: 'genericList' },
      columns: l.colonne,
    })
    console.log(`✓ Creata la lista "${l.nome}"`)
    return creata.id
  }
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${trovata.id}/columns?$select=name&$top=200`)
  const presenti = new Set((cols.value || []).map((c) => c.name))
  const mancanti = l.colonne.filter((c) => !presenti.has(c.name))
  for (const c of mancanti) {
    await graph(token, 'POST', `/sites/${site}/lists/${trovata.id}/columns`, c)
    console.log(`  + ${l.nome}: colonna ${c.name}`)
  }
  console.log(`✓ La lista "${l.nome}" c'era già${mancanti.length ? '' : ', colonne a posto'}`)
  return trovata.id
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const token = await getToken()
  const esistenti = (await graph(token, 'GET', `/sites/${site}/lists?$select=id,displayName&$top=500`)).value || []

  const env = {}
  for (const l of LISTE) env[l.env] = await assicuraLista(token, site, esistenti, l)

  try {
    const docs = await graph(token, 'GET', `/sites/${SITO_DOCS}?$select=id`)
    const drive = await graph(token, 'GET', `/sites/${docs.id}/drive?$select=id,name`)
    env.SP_PREVENTIVI_DRIVE_ID = drive.id
    console.log(`✓ Drive dei preventivi: ${drive.name}`)
  } catch (e) {
    console.log(`⚠️ Drive del sito docs non trovato (${e.message}): SP_PREVENTIVI_DRIVE_ID va messo a mano`)
  }

  scriviEnvLocal(env)
  console.log('\nProssimi passi: node scripts/preventivi-carica-matrice.mjs, poi bash scripts/preventivi-env-vercel.sh\n')
}

/** Aggiunge (o corregge) le variabili in .env.local, senza toccare il resto. */
function scriviEnvLocal(env) {
  const file = join(__dirname, '..', '.env.local')
  let righe = []
  try {
    righe = readFileSync(file, 'utf8').split('\n')
  } catch {}
  for (const [k, val] of Object.entries(env)) {
    const i = righe.findIndex((r) => r.startsWith(`${k}=`))
    if (i >= 0) righe[i] = `${k}=${val}`
    else righe.splice(righe.length && righe[righe.length - 1] === '' ? righe.length - 1 : righe.length, 0, `${k}=${val}`)
    console.log(`✓ .env.local: ${k}`)
  }
  writeFileSync(file, righe.join('\n').replace(/\n*$/, '\n'))
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
