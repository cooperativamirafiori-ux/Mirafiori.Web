#!/usr/bin/env node
/**
 * Provisioning della "Domanda di ammissione socio" (lib/soci/).
 *
 * Idempotente, si può rilanciare quante volte si vuole:
 *   1. crea sul sito Risorse Umane (SP_SITE_RU) la lista "Domande Ammissione
 *      Soci", o aggiunge le colonne che mancano;
 *   2. controlla che esista la cartella dei soci (SP_SOCI_FOLDER, default
 *      "General/RISORSE UMANE/RISORSE UMANE 2/SOCI") nella raccolta del sito;
 *   3. stampa i numeri dell'Elenco Generale già scritti nelle schede RU (solo
 *      per controllo: l'app numera dalle domande, partendo da SOCI_PRIMO_NUMERO=234);
 *   4. scrive SP_LIST_DOMANDE_SOCI e SOCI_MAIL_TO in .env.local (con backup) e
 *      le imposta su Vercel per production/preview/development.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-soci.mjs
 *   node scripts/provision-soci.mjs --no-vercel
 *   node scripts/provision-soci.mjs --mail=claudia.carena@cooperativamirafiori.com
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SP_SITE_RU, SP_LIST_DIPENDENTI (e SP_RU_DRIVE_ID, facoltativa).
 * Permesso Graph: Sites.ReadWrite.All (Application) — l'app scrive questa lista
 * con la propria identità, vedi la nota in lib/soci/data.ts.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, '..', '.env.local')
const SKIP_VERCEL = process.argv.includes('--no-vercel')
const MAIL = (process.argv.find((a) => a.startsWith('--mail=')) || '--mail=claudia.carena@cooperativamirafiori.com').slice(7)

const LIST_NAME = 'Domande Ammissione Soci'
const STATI = ['In attesa di firma', 'Firmata', 'Registrata']

// I `name` DEVONO coincidere con quelli letti da lib/soci/data.ts
const COLUMNS = [
  { name: 'EmailRichiedente', displayName: 'Email richiedente', text: {} },
  { name: 'RUItemId', displayName: 'Id scheda RU', text: {} },
  { name: 'Stato', choice: { choices: STATI, displayAs: 'dropDownMenu' } },
  { name: 'Dati', displayName: 'Dati del modulo (JSON)', text: { allowMultipleLines: true } },
  { name: 'DataDomanda', displayName: 'Data domanda', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'NumeroElencoGenerale', displayName: 'N. Elenco Generale', number: { decimalPlaces: 'none', minimum: 0 } },
  { name: 'DomandaUrl', displayName: 'Domanda firmata (link)', text: {} },
  { name: 'DomandaNome', displayName: 'Domanda firmata (file)', text: {} },
  { name: 'SchedaUrl', displayName: 'Scheda progressiva (link)', text: {} },
  { name: 'DataRegistrazione', displayName: 'Data registrazione', dateTime: { format: 'dateTime', displayAs: 'standard' } },
  { name: 'Esito', displayName: 'Esito / note', text: { allowMultipleLines: true } },
]

function loadEnvLocal() {
  try {
    for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* env già nell'ambiente */ }
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

async function graph(token, method, path, body, extra = {}) {
  const res = await fetch(path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (res.status === 404 && method === 'GET') return null
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/')

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SP_SITE_RU', 'SP_LIST_DIPENDENTI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante in .env.local: ${k}`)
  }
  const site = process.env.SP_SITE_RU
  const token = await getToken()

  // 1. lista
  console.log(`→ Lista "${LIST_NAME}" sul sito Risorse Umane...`)
  const liste = await graph(token, 'GET', `/sites/${site}/lists?$select=id,displayName&$top=200`)
  let listId = (liste.value || []).find((l) => l.displayName === LIST_NAME)?.id
  if (listId) {
    console.log(`✓ Esiste già. ID = ${listId}`)
    const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
    const presenti = new Set((cols.value || []).map((c) => c.name))
    for (const col of COLUMNS.filter((c) => !presenti.has(c.name))) {
      await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, col)
      console.log(`  + colonna aggiunta: ${col.name}`)
    }
  } else {
    const creata = await graph(token, 'POST', `/sites/${site}/lists`, {
      displayName: LIST_NAME,
      list: { template: 'genericList' },
      columns: COLUMNS,
    })
    listId = creata.id
    console.log(`✓ Lista creata. ID = ${listId}`)
  }

  // 2. cartella soci
  const radice = (process.env.SP_SOCI_FOLDER || 'General/RISORSE UMANE/RISORSE UMANE 2/SOCI').replace(/^\/+|\/+$/g, '')
  const drive = process.env.SP_RU_DRIVE_ID || (await graph(token, 'GET', `/sites/${site}/drive?$select=id`)).id
  const anno = new Date().getFullYear()
  for (const rel of [radice, `${radice}/Soci_${anno}/AMMISSIONI SOCI`, `${radice}/Soci_${anno}/SCHEDE PROGRESSIVE DA STAMPARE`]) {
    const it = await graph(token, 'GET', `/drives/${drive}/root:/${enc(rel)}?$select=id,webUrl`)
    console.log(it ? `✓ Cartella trovata: ${rel}` : `⚠ Cartella NON trovata: ${rel}${rel === radice ? '  ← controlla SP_SOCI_FOLDER' : ' (la crea l’app al primo uso)'}`)
  }

  // 3. numerazione
  let url = `/sites/${site}/lists/${process.env.SP_LIST_DIPENDENTI}/items?$expand=fields($select=Title,NumeroElencoGenerale,Socio)&$top=500`
  const conNumero = []
  while (url) {
    const r = await graph(token, 'GET', url, null, { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' })
    for (const it of r.value || []) {
      const n = Number(it.fields?.NumeroElencoGenerale)
      if (Number.isFinite(n) && n > 0) conNumero.push({ n, chi: it.fields?.Title, socio: it.fields?.Socio })
    }
    url = r['@odata.nextLink'] || null
  }
  conNumero.sort((a, b) => b.n - a.n)
  const primo = Number(process.env.SOCI_PRIMO_NUMERO) || 234
  const max = conNumero[0]?.n ?? 0
  console.log(`\n→ Elenco Generale: ${conNumero.length} schede RU hanno un numero. I più alti:`)
  for (const x of conNumero.slice(0, 5)) console.log(`    ${x.n}  ${x.chi}${x.socio === 'Si' ? '' : '  (Socio ≠ Si)'}`)
  console.log(`  (solo informativo: l'app numera dalle domande registrate, partendo da ${primo})`)
  if (max >= primo) console.log(`  ⚠ Nelle schede c'è un numero ≥ ${primo}: controlla che sia giusto.`)

  // 4. variabili
  const variabili = { SP_LIST_DOMANDE_SOCI: listId, SOCI_MAIL_TO: MAIL }
  scriviEnvLocal(variabili)
  if (SKIP_VERCEL) stampaComandiVercel(variabili)
  else impostaVercel(variabili)

  console.log('\nFatto. Dopo il deploy la card "Domanda di ammissione socio" è in Home per tutti.')
}

function scriviEnvLocal(variabili) {
  if (!existsSync(ENV_PATH)) {
    console.log('\n⚠ .env.local non trovato. Aggiungi a mano:')
    for (const [k, v] of Object.entries(variabili)) console.log(`  ${k}=${v}`)
    return
  }
  const originale = readFileSync(ENV_PATH, 'utf8')
  let testo = originale
  for (const [k, v] of Object.entries(variabili)) {
    const re = new RegExp(`^\\s*${k}\\s*=.*$`, 'm')
    testo = re.test(testo) ? testo.replace(re, `${k}=${v}`) : `${testo.replace(/\s*$/, '')}\n${k}=${v}\n`
  }
  if (testo === originale) {
    console.log('\n✓ .env.local già a posto.')
    return
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  writeFileSync(`${ENV_PATH}.bak-${stamp}`, originale)
  writeFileSync(ENV_PATH, testo)
  console.log(`\n✓ .env.local aggiornato (backup in .env.local.bak-${stamp})`)
}

function impostaVercel(variabili) {
  if (spawnSync('vercel', ['--version'], { encoding: 'utf8' }).status !== 0) {
    console.log('\n⚠ CLI Vercel non trovata.')
    stampaComandiVercel(variabili)
    return
  }
  console.log('\n→ Variabili su Vercel...')
  let tuttoOk = true
  for (const [k, v] of Object.entries(variabili)) {
    for (const target of ['production', 'preview', 'development']) {
      const r = spawnSync('vercel', ['env', 'add', k, target], { input: v, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      if (r.status === 0) console.log(`  ✓ ${k} · ${target}`)
      else {
        tuttoOk = false
        console.log(`  ✗ ${k} · ${target} — ${((r.stderr || r.stdout || '').trim().split('\n').pop()) || 'errore'} (forse già presente)`)
      }
    }
  }
  if (!tuttoOk) stampaComandiVercel(variabili)
}

function stampaComandiVercel(variabili) {
  console.log('\nComandi per Vercel (se una variabile esiste già: vercel env rm NOME ambiente, poi ripeti):')
  for (const [k, v] of Object.entries(variabili)) {
    for (const target of ['production', 'preview', 'development']) console.log(`  printf '%s' '${v}' | vercel env add ${k} ${target}`)
  }
}

main().catch((e) => {
  console.error('\n✗ ERRORE:', e.message)
  process.exit(1)
})
