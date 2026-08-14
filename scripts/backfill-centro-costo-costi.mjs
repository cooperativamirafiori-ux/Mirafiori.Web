#!/usr/bin/env node
/**
 * Assegna il centro di costo ai movimenti già in archivio.
 *
 * I costi e gli acquisti registrati prima di questo cambio hanno solo la
 * struttura. Qui si risale dalla struttura al suo centro di costo e lo si
 * scrive sul movimento — una volta sola, adesso.
 *
 * Da qui in avanti nessuno risale più: il centro di costo lo porta il
 * documento, così un domani riassegnare una struttura non riscrive il passato.
 * Questo script esiste proprio perché quel "passato" va scritto una volta.
 *
 * Uso (dalla cartella web/):
 *   node scripts/backfill-centro-costo-costi.mjs            SIMULAZIONE
 *   node scripts/backfill-centro-costo-costi.mjs --apply    esegue
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_STRUTTURE, SP_LIST_COSTI, SP_LIST_ACQUISTI.
 *
 * Idempotente: i movimenti che hanno già un centro di costo non si toccano,
 * nemmeno se diverso da quello della struttura — se qualcuno l'ha corretto a
 * mano, ha ragione lui.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

const LISTE = [
  { etichetta: 'Costi',    env: 'SP_LIST_COSTI' },
  { etichetta: 'Acquisti', env: 'SP_LIST_ACQUISTI' },
]

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

async function main() {
  loadEnvLocal()
  const richieste = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_STRUTTURE', ...LISTE.map((l) => l.env)]
  for (const k of richieste) if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)

  const site = process.env.SHAREPOINT_SITE_ID
  const token = await getToken()

  console.log('')
  console.log('======================================================================')
  console.log(APPLY ? 'BACKFILL CENTRO DI COSTO — ESECUZIONE' : 'BACKFILL CENTRO DI COSTO — SIMULAZIONE (aggiungi --apply)')
  console.log('======================================================================')

  // Struttura → centro di costo
  const strutture = await tuttiGliItem(
    token,
    `/sites/${site}/lists/${process.env.SP_LIST_STRUTTURE}/items?$select=id&$expand=fields($select=Title,Codice,CentroCosto,CentroCostoLookupId)&$top=500`,
  )
  const ccDiStruttura = new Map()
  const nomeStruttura = new Map()
  for (const s of strutture) {
    const id = Number(s.id)
    nomeStruttura.set(id, s.fields?.Title ?? `struttura ${id}`)
    const cc = Number(s.fields?.CentroCosto?.LookupId ?? s.fields?.CentroCostoLookupId ?? 0)
    if (cc) ccDiStruttura.set(id, cc)
  }
  console.log(`\nStrutture con centro di costo assegnato: ${ccDiStruttura.size} su ${strutture.length}`)

  let totaleAggiornati = 0
  let totaleOrfani = 0

  for (const l of LISTE) {
    const lista = process.env[l.env]
    const righe = await tuttiGliItem(
      token,
      `/sites/${site}/lists/${lista}/items?$select=id&$expand=fields($select=Title,StrutturaLookupId,CentroCostoLookupId)&$top=500`,
    )

    const giaOk = righe.filter((r) => Number(r.fields?.CentroCostoLookupId ?? 0))
    const daFare = righe.filter((r) => !Number(r.fields?.CentroCostoLookupId ?? 0))

    console.log(`\n${l.etichetta}: ${righe.length} record — ${giaOk.length} già assegnati, ${daFare.length} da valutare`)

    for (const r of daFare) {
      const strutturaId = Number(r.fields?.StrutturaLookupId ?? 0)
      const cc = ccDiStruttura.get(strutturaId)
      const titolo = r.fields?.Title || `item ${r.id}`

      if (!cc) {
        totaleOrfani++
        const perche = strutturaId
          ? `struttura "${nomeStruttura.get(strutturaId) ?? strutturaId}" senza centro di costo`
          : 'nessuna struttura'
        console.log(`  ✗ ${titolo}  →  da assegnare a mano (${perche})`)
        continue
      }

      totaleAggiornati++
      if (APPLY) {
        await graph(token, 'PATCH', `/sites/${site}/lists/${lista}/items/${r.id}/fields`, {
          CentroCostoLookupId: cc,
        })
      }
      console.log(`  ${APPLY ? '✓' : '·'} ${titolo}  →  cc ${cc} (da ${nomeStruttura.get(strutturaId)})`)
    }
  }

  console.log('')
  if (APPLY) {
    console.log(`✓ Fatto. ${totaleAggiornati} movimenti assegnati.`)
  } else {
    console.log(`Verranno assegnati ${totaleAggiornati} movimenti. Nulla è stato modificato.`)
    console.log('Per eseguire:  node scripts/backfill-centro-costo-costi.mjs --apply')
  }
  if (totaleOrfani) {
    console.log(`\n⚠ ${totaleOrfani} movimenti restano senza centro di costo: nel cruscotto`)
    console.log('  li trovi raggruppati in fondo, sotto "Senza centro di costo".')
  }
  console.log('')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
