#!/usr/bin/env node
/**
 * Preparazione di SharePoint per l'area Utenze (decisioni di Dennis del 09/10/2026).
 *
 * 1. Lista "Costi Ricorrenti Strutture": colonna `DataFine` (data). Serve allo
 *    storico dei costi fissi: un affitto che aumenta chiude la voce vecchia e ne
 *    apre una nuova, così il passato resta com'era.
 *
 * 2. Lista "Mappatura Utenze":
 *
 *  - Cascina (A01) al 100%: la divisione 70/30 con la vecchia A02 non vale più.
 *      · gas  00881207624030   → 100% su A01 (riga 70%), si cancella la riga doppia al 30%
 *      · acqua 0100117100003247 → 100% su A01 (riga 70%), si cancella la riga doppia al 30%
 *      · luce IT001E01927001   → 100% su A01
 *      · luce IT001E10096962   → era su A02 (non esiste più): passa su A01 al 100%
 *  - luce IT001E12954462 era su A06, unita in A05 Pian della Mussa → A05 al 100%
 *  - gas AGN di Casa San Francesco → A05 Pian della Mussa al 100% (era al 50%)
 *
 * Le righe si riconoscono dal CODICE e dalla percentuale/struttura attuali, non
 * dall'id: se nel frattempo qualcuno le ha già sistemate, lo script le salta.
 *
 * Uso (da web/):
 *   node scripts/utenze-prepara-sharepoint.mjs            prova: mostra cosa farebbe
 *   node scripts/utenze-prepara-sharepoint.mjs --applica  scrive su SharePoint
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const APPLICA = process.argv.includes('--applica')
const SITE = process.env.SHAREPOINT_SITE_ID
const LISTA = process.env.SP_LIST_MAPPATURA_UTENZE || '8fe22d3a-2051-4b53-a01d-4f3c868710ba'
const STRUTTURE = process.env.SP_LIST_STRUTTURE

let token = ''
async function graph(metodo, path, body) {
  if (!token) {
    const r = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.GRAPH_CLIENT_ID,
        client_secret: process.env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    })
    if (!r.ok) throw new Error(`token: ${r.status} ${await r.text()}`)
    token = (await r.json()).access_token
  }
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`${metodo} ${path.slice(0, 80)} → ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.status === 204 ? null : r.json()
}

const RICORRENTI = process.env.SP_LIST_COSTI_RICORRENTI || 'a5e90e19-b989-4534-94e5-5a4d5d3e7547'

async function colonnaDataFine() {
  const colonne = (await graph('GET', `/sites/${SITE}/lists/${RICORRENTI}/columns?$top=200`)).value
  if (colonne.some((c) => c.name === 'DataFine')) {
    console.log('  · Costi Ricorrenti: colonna DataFine già presente')
    return
  }
  console.log(`  ${APPLICA ? '+' : '(prova)'} Costi Ricorrenti: aggiungo la colonna DataFine (data, facoltativa)`)
  if (APPLICA) {
    await graph('POST', `/sites/${SITE}/lists/${RICORRENTI}/columns`, {
      name: 'DataFine',
      displayName: 'Data fine',
      description: 'Ultimo giorno in cui il costo vale. Vuota = vale ancora.',
      dateTime: { format: 'dateOnly' },
    })
  }
}

async function main() {
  console.log('\n1. Costi fissi')
  await colonnaDataFine()
  console.log('\n2. Mappatura Utenze')
  const strutture = (await graph('GET', `/sites/${SITE}/lists/${STRUTTURE}/items?expand=fields($select=Title,Codice)&$top=500`)).value
  const idStruttura = (codice) => {
    const s = strutture.find((x) => x.fields.Codice === codice)
    if (!s) throw new Error(`struttura ${codice} non trovata`)
    return Number(s.id)
  }
  const A01 = idStruttura('A01')
  const A05 = idStruttura('A05')

  const righe = (await graph('GET', `/sites/${SITE}/lists/${LISTA}/items?expand=fields&$top=999`)).value.map((i) => ({
    id: i.id,
    codice: String(i.fields.Title ?? '').trim(),
    perc: Number(i.fields.Percentuale ?? 0),
    struttura: Number(i.fields.StrutturaLookupId ?? 0) || null,
  }))

  const operazioni = []
  const una = (codice, filtro, descr) => {
    const r = righe.filter((x) => x.codice === codice && filtro(x))
    if (r.length === 0) console.log(`  · ${codice}: niente da fare (${descr} — già sistemata?)`)
    if (r.length > 1) throw new Error(`${codice}: ${r.length} righe corrispondono a "${descr}", mi fermo`)
    return r[0]
  }
  const aggiorna = (codice, filtro, campi, descr) => {
    const r = una(codice, filtro, descr)
    if (r) operazioni.push({ tipo: 'aggiorna', r, campi, descr })
  }
  const cancella = (codice, filtro, descr) => {
    const r = una(codice, filtro, descr)
    if (r) operazioni.push({ tipo: 'cancella', r, descr })
  }
  const suA = (id) => ({ StrutturaLookupId: id, CodiceStrutturaLookupId: id, Percentuale: 100 })

  aggiorna('IT001E01927001', (x) => x.perc !== 100 || x.struttura !== A01, suA(A01), 'luce Cascina → A01 100%')
  aggiorna('IT001E10096962', (x) => x.perc !== 100 || x.struttura !== A01, suA(A01), 'luce ex A02 → A01 100%')
  aggiorna('00881207624030', (x) => x.struttura === A01 && x.perc !== 100, suA(A01), 'gas Cascina → A01 100%')
  cancella('00881207624030', (x) => x.struttura !== A01, 'gas: riga doppia al 30% senza struttura')
  aggiorna('0100117100003247', (x) => x.struttura === A01 && x.perc !== 100, suA(A01), 'acqua SMAT Cascina → A01 100%')
  cancella('0100117100003247', (x) => x.struttura !== A01, 'acqua: riga doppia al 30% senza struttura')
  aggiorna('IT001E12954462', (x) => x.struttura !== A05 || x.perc !== 100, suA(A05), 'luce ex A06 → A05 Pian della Mussa 100%')
  aggiorna('AGN GAS - Casa San Francesco', (x) => x.struttura !== A05 || x.perc !== 100, suA(A05), 'gas AGN Casa San Francesco → A05 100%')

  console.log(`\n${APPLICA ? 'APPLICO' : 'PROVA (niente scritto)'} — ${operazioni.length} operazioni:\n`)
  for (const o of operazioni) {
    console.log(`  ${o.tipo === 'cancella' ? '✗ cancella' : '✎ aggiorna'} riga ${o.r.id} ${o.r.codice} (oggi ${o.r.perc}% struttura ${o.r.struttura ?? '—'}): ${o.descr}`)
    if (!APPLICA) continue
    if (o.tipo === 'aggiorna') await graph('PATCH', `/sites/${SITE}/lists/${LISTA}/items/${o.r.id}/fields`, o.campi)
    else await graph('DELETE', `/sites/${SITE}/lists/${LISTA}/items/${o.r.id}`)
  }
  console.log(APPLICA ? '\n✓ Fatto.' : '\nPer applicare: node scripts/utenze-prepara-sharepoint.mjs --applica')
}
main().catch((e) => { console.error('✗', e.message ?? e); process.exit(1) })
