#!/usr/bin/env node
/**
 * Provisioning dell'area IT e Dispositivi: le tre liste nuove.
 *
 *   "SIM e Utenze"       → SP_LIST_SIM
 *   "Assegnazioni Beni"  → SP_LIST_ASSEGNAZIONI
 *   "Assegnazioni SIM"   → SP_LIST_ASSEGNAZIONI_SIM
 *
 * I dispositivi NON hanno una lista propria: stanno nell'Inventario Beni, con le
 * colonne che aggiunge `provision-inventario.mjs`. **Quello va lanciato prima**,
 * perché "Assegnazioni Beni" ci punta con un lookup.
 *
 * Tutto idempotente: si può rilanciare per aggiungere le colonne comparse dopo.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-inventario.mjs      ← prima questo
 *   node scripts/provision-it.mjs
 *   node scripts/provision-it.mjs --no-vercel
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_INVENTARIO, SP_LIST_CENTRI_COSTO.
 *
 * Permesso Graph: Sites.ReadWrite.All (Application).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, '..', '.env.local')
const SKIP_VERCEL = process.argv.includes('--no-vercel')

// Devono coincidere con types/it.ts
const STATI_ASSEGNAZIONE = ['Attiva', 'Chiusa']
const STATI_SIM = ['Attiva', 'Cessata', 'In attesa', 'Bloccata']
const TIPI_PIANO = ['Voce + Dati', 'Dati', 'Voce', 'Altro']

/** Colonne comuni alle due liste di assegnazione: la forma è la stessa. */
const colonneAssegnazione = (etichettaFine) => [
  { name: 'AssegnatarioMail', displayName: 'Assegnatario (mail)', text: {} },
  { name: 'AssegnatarioNome', displayName: 'Assegnatario (nome)', text: {} },
  { name: 'ServizioLegacy', displayName: 'Servizio (vecchie liste IT)', text: {} },
  { name: 'NomeUtenza', displayName: 'Nome utenza', text: {} },
  { name: 'DataAssegnazione', displayName: 'Data assegnazione', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'DataFine', displayName: etichettaFine, dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'Stato', choice: { choices: STATI_ASSEGNAZIONE, displayAs: 'dropDownMenu' } },
  { name: 'Note', text: { allowMultipleLines: true } },
  { name: 'VerbaleConsegnaUrl', displayName: 'Verbale consegna (link)', text: { maxLength: 255 } },
  { name: 'VerbaleConsegnaNome', displayName: 'Verbale consegna (file)', text: {} },
  { name: 'VerbaleRestituzioneUrl', displayName: 'Verbale restituzione (link)', text: { maxLength: 255 } },
  { name: 'VerbaleRestituzioneNome', displayName: 'Verbale restituzione (file)', text: {} },
  { name: 'IdListaIT', displayName: 'ID lista IT', text: {} },
]

/**
 * Le tre liste, nell'ordine in cui vanno create: "Assegnazioni SIM" punta a
 * "SIM e Utenze", quindi quella viene prima.
 */
const LISTE = [
  {
    nome: 'SIM e Utenze',
    env: 'SP_LIST_SIM',
    // Il Title è l'ICCID, il seriale stampato sulla scheda.
    titolo: 'ICCID',
    colonne: [
      { name: 'Numero', text: {} },
      { name: 'Operatore', text: {} },
      { name: 'TipoPiano', displayName: 'Tipo piano', choice: { choices: TIPI_PIANO, displayAs: 'dropDownMenu' } },
      { name: 'NomePiano', displayName: 'Nome piano', text: {} },
      { name: 'FornitoreIntermediario', displayName: 'Fornitore / intermediario', text: {} },
      { name: 'DataAttivazione', displayName: 'Data attivazione', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
      { name: 'DataCessazione', displayName: 'Data cessazione', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
      { name: 'RiferimentoContratto', displayName: 'Riferimento contratto', text: {} },
      { name: 'StatoSim', displayName: 'Stato', choice: { choices: STATI_SIM, displayAs: 'dropDownMenu' } },
      { name: 'CostoMensile', displayName: 'Costo mensile', currency: { locale: 'it-IT' } },
      { name: 'Note', text: { allowMultipleLines: true } },
      { name: 'AssegnatarioMail', displayName: 'Assegnatario (mail)', text: {} },
      { name: 'AssegnatarioNome', displayName: 'Assegnatario (nome)', text: {} },
      { name: 'IdListaIT', displayName: 'ID lista IT', text: {} },
    ],
    choice: { StatoSim: STATI_SIM, TipoPiano: TIPI_PIANO },
    lookup: [
      { name: 'CentroDiCosto', displayName: 'Centro di costo', env: 'SP_LIST_CENTRI_COSTO' },
      { name: 'BeneAssociato', displayName: 'Dispositivo in cui sta', env: 'SP_LIST_INVENTARIO' },
    ],
  },
  {
    nome: 'Assegnazioni Beni',
    env: 'SP_LIST_ASSEGNAZIONI',
    titolo: 'Assegnazione',
    colonne: colonneAssegnazione('Data restituzione'),
    choice: { Stato: STATI_ASSEGNAZIONE },
    lookup: [
      { name: 'Bene', displayName: 'Bene', env: 'SP_LIST_INVENTARIO' },
      { name: 'CentroDiCosto', displayName: 'Centro di costo', env: 'SP_LIST_CENTRI_COSTO' },
    ],
  },
  {
    nome: 'Assegnazioni SIM',
    env: 'SP_LIST_ASSEGNAZIONI_SIM',
    titolo: 'Assegnazione',
    colonne: colonneAssegnazione('Data cessazione'),
    choice: { Stato: STATI_ASSEGNAZIONE },
    lookup: [
      { name: 'Sim', displayName: 'SIM', env: 'SP_LIST_SIM', preferita: 'Numero' },
      { name: 'CentroDiCosto', displayName: 'Centro di costo', env: 'SP_LIST_CENTRI_COSTO' },
    ],
  },
]

// ============================================================
// Infrastruttura
// ============================================================

function loadEnvLocal() {
  try {
    const raw = readFileSync(ENV_PATH, 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* env già impostate */ }
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

// ============================================================
// Programma
// ============================================================

async function main() {
  loadEnvLocal()
  for (const k of [
    'GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET',
    'SHAREPOINT_SITE_ID', 'SP_LIST_INVENTARIO',
  ]) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  // Senza la lista dei centri di costo l'area non funziona per niente: il centro
  // di costo è obbligatorio su ogni assegnazione, quindi un lookup mancante
  // farebbe fallire ogni singola consegna con un 400 di Graph. Meglio fermarsi qui.
  if (!process.env.SP_LIST_CENTRI_COSTO) {
    throw new Error(
      'SP_LIST_CENTRI_COSTO manca. Lancia prima `node scripts/provision-centri-costo.mjs`: ' +
        'senza quella lista il centro di costo — obbligatorio su ogni assegnazione — non è collegabile.',
    )
  }

  const site = process.env.SHAREPOINT_SITE_ID
  console.log('→ Autenticazione Graph...')
  const token = await getToken()

  const esistenti = await graph(token, 'GET', `/sites/${site}/lists?$select=id,displayName&$top=200`)
  const perNome = new Map((esistenti.value || []).map((l) => [l.displayName, l.id]))

  const valori = {}
  for (const spec of LISTE) {
    console.log(`\n── ${spec.nome}`)
    let listId = perNome.get(spec.nome)

    if (listId) {
      console.log(`✓ Esiste già. ID = ${listId}`)
      await ensureColumns(token, site, listId, spec.colonne)
    } else {
      const creata = await graph(token, 'POST', `/sites/${site}/lists`, {
        displayName: spec.nome,
        list: { template: 'genericList' },
        columns: spec.colonne,
      })
      listId = creata.id
      console.log(`✓ Creata. ID = ${listId}`)
    }

    // L'id va in process.env subito: la lista dopo potrebbe puntarci.
    process.env[spec.env] = listId
    valori[spec.env] = listId

    for (const [colonna, scelte] of Object.entries(spec.choice ?? {})) {
      await estendiChoice(token, site, listId, spec.nome, colonna, scelte)
    }
    await ensureLookups(token, site, listId, spec)
    await rinominaTitle(token, site, listId, spec.titolo)
  }

  scriviEnvLocal(valori)
  if (SKIP_VERCEL) {
    console.log('\n(--no-vercel) Passaggio Vercel saltato. Comandi pronti:')
    printVercelCommands(valori)
  } else {
    setVercelEnv(valori)
  }

  console.log('\n============================================================')
  console.log('Fatto. Ultimi passaggi:')
  console.log('  1. `node scripts/migra-dispositivi-it.mjs` (prima senza --applica)')
  console.log('     porta dentro i 52 dispositivi e le 46 SIM di gruppo_it;')
  console.log('  2. concedi l\'area "IT e Dispositivi" da Amministrazione › Permessi;')
  console.log('  3. fai un nuovo deploy perché Vercel legga le variabili.')
  console.log('============================================================')
}

/** Aggiunge le sole colonne mancanti. */
async function ensureColumns(token, site, listId, colonne) {
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
  const presenti = new Set((cols.value || []).map((c) => c.name))
  const mancanti = colonne.filter((c) => !presenti.has(c.name))
  if (!mancanti.length) {
    console.log('✓ Tutte le colonne sono già presenti.')
    return
  }
  for (const col of mancanti) {
    await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, col)
    console.log(`  + colonna: ${col.name}`)
  }
}

/** Lookup verso altre liste. Idempotente, e salta se la lista puntata manca. */
async function ensureLookups(token, site, listId, spec) {
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
  const presenti = new Set((cols.value || []).map((c) => c.name))

  for (const l of spec.lookup ?? []) {
    if (presenti.has(l.name)) {
      console.log(`✓ Lookup già presente: ${l.name}`)
      continue
    }
    const listaPuntata = process.env[l.env]
    if (!listaPuntata) {
      console.log(`⚠ Lookup "${l.name}" saltato: manca ${l.env}.`)
      continue
    }

    let colonnaMostrata = 'Title'
    if (l.preferita) {
      const suPuntata = await graph(
        token, 'GET', `/sites/${site}/lists/${listaPuntata}/columns?$select=name&$top=200`,
      )
      const nomi = new Set((suPuntata.value || []).map((c) => c.name))
      if (nomi.has(l.preferita)) colonnaMostrata = l.preferita
    }

    try {
      await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, {
        name: l.name,
        displayName: l.displayName,
        lookup: {
          listId: listaPuntata,
          columnName: colonnaMostrata,
          allowMultipleValues: false,
          allowUnlimitedLength: false,
        },
      })
      console.log(`  + lookup: ${l.name} → ${l.env}.${colonnaMostrata}`)
    } catch (e) {
      console.log(`\n⚠ Lookup "${l.name}" non creato via Graph: ${e.message}`)
      console.log(`  Crealo a mano nella lista "${spec.nome}":`)
      console.log(`    Aggiungi colonna → Ricerca · nome interno esatto "${l.name}" · colonna "${colonnaMostrata}"\n`)
    }
  }
}

/** Aggiunge a una Choice i valori mancanti, senza toccare i presenti. */
async function estendiChoice(token, site, listId, etichetta, colonna, valori) {
  const cols = await graph(
    token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=id,name,choice&$top=200`,
  )
  const col = (cols.value || []).find((c) => c.name === colonna)
  if (!col?.choice) return
  const scelte = col.choice.choices || []
  const mancanti = valori.filter((v) => !scelte.includes(v))
  if (!mancanti.length) return
  await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/columns/${col.id}`, {
    choice: { ...col.choice, choices: [...scelte, ...mancanti] },
  })
  console.log(`  + ${etichetta}.${colonna}: aggiunti ${mancanti.map((v) => `"${v}"`).join(', ')}`)
}

/**
 * Dà al Title un'etichetta che dica qualcosa ("ICCID", "Assegnazione") invece di
 * "Titolo". Cosmetico, ma è la prima colonna che si vede aprendo la lista.
 */
async function rinominaTitle(token, site, listId, etichetta) {
  if (!etichetta) return
  const cols = await graph(
    token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=id,name,displayName&$top=200`,
  )
  const title = (cols.value || []).find((c) => c.name === 'Title')
  if (!title || title.displayName === etichetta) return
  await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/columns/${title.id}`, {
    displayName: etichetta,
  }).catch((e) => console.log(`  ⚠ Title non rinominato: ${e.message}`))
}

/** Scrive le variabili in .env.local, con backup datato. */
function scriviEnvLocal(valori) {
  const righe = Object.entries(valori).map(([k, v]) => `${k}=${v}`)
  if (!existsSync(ENV_PATH)) {
    console.log('\n⚠ .env.local non trovato. Aggiungi a mano:\n')
    righe.forEach((r) => console.log(`  ${r}`))
    return
  }

  const originale = readFileSync(ENV_PATH, 'utf8')
  let aggiornato = originale
  const daAggiungere = []
  for (const [chiave, valore] of Object.entries(valori)) {
    const regex = new RegExp(`^\\s*${chiave}\\s*=.*$`, 'm')
    if (regex.test(aggiornato)) aggiornato = aggiornato.replace(regex, `${chiave}=${valore}`)
    else daAggiungere.push(`${chiave}=${valore}`)
  }
  if (daAggiungere.length) {
    aggiornato =
      `${aggiornato.replace(/\s*$/, '')}\n\n# Area IT e Dispositivi (scritta da scripts/provision-it.mjs)\n` +
      `${daAggiungere.join('\n')}\n`
  }
  if (aggiornato === originale) {
    console.log('\n✓ .env.local: le variabili sono già corrette.')
    return
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  writeFileSync(`${ENV_PATH}.bak-${stamp}`, originale)
  writeFileSync(ENV_PATH, aggiornato)
  console.log('\n✓ .env.local aggiornato:')
  righe.forEach((r) => console.log(`  ${r}`))
  console.log(`  (backup in .env.local.bak-${stamp})`)
}

function setVercelEnv(valori) {
  const hasVercel = spawnSync('vercel', ['--version'], { encoding: 'utf8' }).status === 0
  if (!hasVercel) {
    console.log('\n⚠ CLI Vercel non trovata. Installa con `npm i -g vercel`, poi:')
    printVercelCommands(valori)
    return
  }
  console.log('\n→ Imposto le variabili su Vercel (production, preview, development)...')
  let tuttoOk = true
  for (const [chiave, valore] of Object.entries(valori)) {
    for (const target of ['production', 'preview', 'development']) {
      const r = spawnSync('vercel', ['env', 'add', chiave, target], {
        input: String(valore), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      })
      if (r.status === 0) console.log(`  ✓ ${chiave} · ${target}`)
      else {
        tuttoOk = false
        const msg = (r.stderr || r.stdout || '').trim().split('\n').slice(-1)[0]
        console.log(`  ✗ ${chiave} · ${target} — ${msg || 'errore'} (probabilmente già presente)`)
      }
    }
  }
  if (!tuttoOk) {
    console.log('\nSe un ambiente è fallito perché la variabile esisteva già, rimuovila con')
    console.log('`vercel env rm <CHIAVE> <ambiente>` e ripeti, oppure usa questi comandi:')
    printVercelCommands(valori)
  } else {
    console.log('\n✓ Variabili impostate su Vercel. Serve un nuovo deploy per applicarle.')
  }
}

function printVercelCommands(valori) {
  console.log('')
  for (const [chiave, valore] of Object.entries(valori)) {
    for (const target of ['production', 'preview', 'development']) {
      console.log(`  printf '%s' '${valore}' | vercel env add ${chiave} ${target}`)
    }
  }
  console.log('')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
