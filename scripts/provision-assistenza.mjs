#!/usr/bin/env node
/**
 * Provisioning della sezione "Assistenza IT".
 *
 * Ricrea sul sito principale la lista che l'ufficio IT aveva su gruppo_it
 * ("Registro Assistenza IT", vuota e col lookup rotto), con lo stesso
 * vocabolario di tendine e in più i legami con Inventario Beni, Strutture e
 * Centri di Costo — legami impossibili da lì, perché quelle liste vivono qui.
 *
 * Fa tre cose, tutte idempotenti:
 *   1. crea (se non esiste) la lista "Assistenza IT" con le colonne usate da
 *      lib/assistenza/data.ts;
 *   2. aggiunge i lookup (Graph non li accetta alla creazione della lista,
 *      servono chiamate separate);
 *   3. allinea i valori delle colonne Choice, così chi ha già eseguito lo
 *      script recupera i valori aggiunti dopo rilanciandolo.
 *
 * Poi scrive SP_LIST_ASSISTENZA in .env.local (con backup) e la imposta su
 * Vercel per production/preview/development, a meno di --no-vercel.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-assistenza.mjs
 *   node scripts/provision-assistenza.mjs --no-vercel   # solo lista + .env.local
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SHAREPOINT_SITE_ID
 * Facoltative (se mancano, il lookup relativo si salta con un avviso):
 *   SP_LIST_INVENTARIO, SP_LIST_STRUTTURE, SP_LIST_CENTRI_COSTO
 *
 * Permesso Graph necessario: Sites.ReadWrite.All (Application).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, '..', '.env.local')
const ENV_KEY = 'SP_LIST_ASSISTENZA'

/** --no-vercel: crea solo la lista, senza toccare le variabili su Vercel. */
const SKIP_VERCEL = process.argv.includes('--no-vercel')

const LIST_NAME = 'Assistenza IT'

// ⚠️ Questi elenchi devono coincidere con types/assistenza.ts.
// `estendiChoice` è additivo: togliere un valore da qui NON lo rimuove dalla
// colonna su SharePoint. Per quello serve `node scripts/pulisci-choice.mjs`.
const STATI = [
  'Inviata', 'Presa in carico', 'In lavorazione', 'Attesa fornitore',
  'Attesa utente', 'Risolta', 'Annullata',
]
const TIPOLOGIE = [
  'Guasto/Problema', 'Assistenza configurazioni', 'Richiesta nuovo dispositivo',
  'Richiesta licenza/software', 'Altro',
]
const CATEGORIE = [
  'PC/Laptop', 'Smartphone/Tablet', 'Sim/Telefonia', 'Stampante/Periferiche',
  'Rete/Wi Fi', 'Software / Licenze', 'Altro',
]
const PRIORITA = ['Bassa', 'Media', 'Alta', 'Critica']
const IMPATTI = ['Un utente', 'Gruppo / Servizio', 'Azienda']

// I `name` DEVONO coincidere con quelli letti da lib/assistenza/data.ts
const COLUMNS = [
  // --- Richiesta: la compila chi chiede ---
  { name: 'Richiedente', personOrGroup: { allowMultipleSelection: false, chooseFromType: 'peopleOnly' } },
  { name: 'DataApertura', dateTime: { format: 'dateTime', displayAs: 'standard' } },
  { name: 'Tipologia', displayName: 'Tipologia richiesta', choice: { choices: TIPOLOGIE, displayAs: 'dropDownMenu' } },
  { name: 'Categoria', displayName: 'Categoria richiesta', choice: { choices: CATEGORIE, displayAs: 'dropDownMenu' } },
  // Il dispositivo censito sta nel lookup `Bene`; questo è il testo libero per
  // quando non c'è (rete, un'aula, una stampante di nessuno).
  { name: 'DispositivoAltro', displayName: 'Dispositivo (non in inventario)', text: {} },
  { name: 'Problema', text: { allowMultipleLines: true } },
  { name: 'DaQuando', displayName: 'Da quando', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'Bloccante', displayName: 'Impedisce di lavorare', boolean: {} },
  { name: 'Impatto', choice: { choices: IMPATTI, displayAs: 'dropDownMenu' } },
  { name: 'Recapito', displayName: 'Telefono', text: {} },
  { name: 'Disponibilita', displayName: 'Quando si trova', text: {} },
  { name: 'AllegatoUrl', text: {} },
  { name: 'AllegatoNome', text: {} },

  // --- Gestione: la compila l'IT ---
  { name: 'Stato', choice: { choices: STATI, displayAs: 'dropDownMenu' } },
  { name: 'Priorita', displayName: 'Priorità', choice: { choices: PRIORITA, displayAs: 'dropDownMenu' } },
  { name: 'Assegnato', personOrGroup: { allowMultipleSelection: false, chooseFromType: 'peopleOnly' } },
  { name: 'Analisi', text: { allowMultipleLines: true } },
  // Cosa è stato fatto: è interno *e* finisce nella mail di chiusura, quindi
  // si scrive in italiano leggibile, non in sigle.
  { name: 'Interventi', text: { allowMultipleLines: true } },
  { name: 'AssistenzaEsterna', displayName: 'Assistenza esterna', boolean: {} },
  { name: 'FornitoreEsterno', displayName: 'Fornitore esterno', text: {} },
  { name: 'OreLavoro', displayName: 'Ore lavoro', number: { decimalPlaces: 'two', minimum: 0 } },
  { name: 'NoteInterne', text: { allowMultipleLines: true } },
  { name: 'MotivoAnnullamento', text: { allowMultipleLines: true } },
  { name: 'DataChiusura', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  // Quante volte il richiedente ha detto "il problema è tornato": un 3 qui è
  // il segnale che il guasto non era quello che si pensava.
  { name: 'Riaperture', number: { decimalPlaces: 'none', minimum: 0 } },

  // --- Interni al flusso ---
  { name: 'DigestInviato', boolean: {} },
]

/**
 * Lookup, creati separatamente (vedi nota in testa).
 *
 * `Bene` è il punto — l'unico — in cui il ticketing tocca l'anagrafica: da lì
 * la scheda del dispositivo può mostrare il suo storico di guasti.
 * `CentroCosto` è una fotografia scritta dall'app dall'assegnazione attiva del
 * bene, non un dato chiesto a chi apre il ticket: serve al controllo di
 * gestione per sapere dove è maturato il costo dell'intervento.
 */
const LOOKUP_COLUMNS = [
  {
    name: 'Bene',
    displayName: 'Dispositivo',
    env: 'SP_LIST_INVENTARIO',
    /** Il codice INV-xxxx sta in Title. */
    colonne: ['Title'],
  },
  {
    name: 'Struttura',
    displayName: 'Dove si trova',
    env: 'SP_LIST_STRUTTURE',
    colonne: ['StrutturaLabel', 'Title'],
  },
  {
    name: 'CentroCosto',
    displayName: 'Centro di costo',
    env: 'SP_LIST_CENTRI_COSTO',
    colonne: ['Title'],
  },
]

// --- carica .env.local se le env non sono già nell'ambiente ---
function loadEnvLocal() {
  try {
    const raw = readFileSync(ENV_PATH, 'utf8')
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

async function main() {
  loadEnvLocal()
  for (const k of [
    'GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID',
  ]) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID

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

  await ensureLookups(token, site, listId)
  await allineaChoice(token, site, listId)

  scriviEnvLocal(listId)
  if (SKIP_VERCEL) {
    console.log('\n(--no-vercel) Passaggio Vercel saltato. Comandi pronti:')
    printVercelCommands(listId)
  } else {
    setVercelEnv(listId)
  }

  console.log('\n============================================================')
  console.log('Fatto. La sezione è aperta a tutti: per aprire una richiesta')
  console.log('non serve alcun permesso. La scrivania /assistenza/gestione')
  console.log(`resta a chi ha l'area "IT e Dispositivi" nei Permessi.`)
  console.log('============================================================')
}

/** Aggiunge alla lista esistente le sole colonne mancanti (idempotente) */
async function ensureColumns(token, site, listId) {
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
  const present = new Set((cols.value || []).map((c) => c.name))
  const mancanti = COLUMNS.filter((c) => !present.has(c.name))
  if (!mancanti.length) {
    console.log('✓ Tutte le colonne standard sono già presenti.')
    return
  }
  for (const col of mancanti) {
    await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, col)
    console.log(`  + colonna aggiunta: ${col.name}`)
  }
}

/**
 * Crea i lookup verso Inventario Beni, Strutture e Centri di Costo.
 *
 * Graph vuole `lookup.listId` + `columnName` (la colonna della lista di origine
 * da mostrare): si prende la prima delle `colonne` candidate che esiste davvero.
 */
async function ensureLookups(token, site, listId) {
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
  const present = new Set((cols.value || []).map((c) => c.name))

  for (const l of LOOKUP_COLUMNS) {
    if (present.has(l.name)) {
      console.log(`✓ Lookup già presente: ${l.name}`)
      continue
    }

    const listaOrigine = process.env[l.env]
    if (!listaOrigine) {
      console.log(`⚠ ${l.env} non impostata: salto il lookup "${l.name}".`)
      console.log(`  Rilancia lo script quando la lista esiste: aggiungerà solo quello che manca.`)
      continue
    }

    const colsOrigine = await graph(
      token, 'GET', `/sites/${site}/lists/${listaOrigine}/columns?$select=name&$top=200`,
    )
    const nomi = new Set((colsOrigine.value || []).map((c) => c.name))
    const colonnaMostrata = l.colonne.find((c) => nomi.has(c)) || 'Title'

    try {
      await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, {
        name: l.name,
        displayName: l.displayName,
        lookup: {
          listId: listaOrigine,
          columnName: colonnaMostrata,
          allowMultipleValues: false,
          allowUnlimitedLength: false,
        },
      })
      console.log(`  + lookup aggiunto: ${l.name} → ${l.env}.${colonnaMostrata}`)
    } catch (e) {
      // Alcuni tenant non permettono di creare colonne lookup via Graph.
      // Non è un motivo per far fallire tutto il resto: lo si crea a mano.
      console.log(`\n⚠ Lookup "${l.name}" non creato via Graph: ${e.message}`)
      console.log(`  Crealo a mano nella lista "${LIST_NAME}" su SharePoint:`)
      console.log(`    Aggiungi colonna → Ricerca (Lookup)`)
      console.log(`    Nome interno: ${l.name}  ·  Colonna mostrata: ${colonnaMostrata}`)
      console.log(`  Il nome interno deve essere esattamente "${l.name}", altrimenti l'app non lo legge.\n`)
    }
  }
}

/**
 * Aggiunge a una colonna Choice i valori che le mancano, senza toccare quelli
 * già presenti. Serve sulle liste già create: `ensureColumns` aggiunge le
 * colonne mancanti, non i valori mancanti di una colonna che esiste già.
 */
async function estendiChoice(token, site, listId, etichetta, colonna, valori) {
  const cols = await graph(
    token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=id,name,choice&$top=200`,
  )
  const col = (cols.value || []).find((c) => c.name === colonna)
  if (!col) {
    console.log(`⚠ ${etichetta}: colonna "${colonna}" non trovata, salto.`)
    return
  }
  if (!col.choice) {
    console.log(`✓ ${etichetta}: "${colonna}" non è una Choice, nessuna modifica necessaria.`)
    return
  }

  const scelte = col.choice.choices || []
  const mancanti = valori.filter((v) => !scelte.includes(v))
  if (!mancanti.length) {
    console.log(`✓ ${etichetta}: "${colonna}" ha già tutti i valori previsti.`)
    return
  }

  await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/columns/${col.id}`, {
    choice: { ...col.choice, choices: [...scelte, ...mancanti] },
  })
  console.log(`  + ${etichetta}.${colonna}: aggiunti ${mancanti.map((v) => `"${v}"`).join(', ')}`)
}

/** Allinea le Choice della lista: rilanciare lo script recupera i valori nuovi. */
async function allineaChoice(token, site, listId) {
  const daAllineare = [
    ['Stato', STATI],
    ['Tipologia', TIPOLOGIE],
    ['Categoria', CATEGORIE],
    ['Priorita', PRIORITA],
    ['Impatto', IMPATTI],
  ]
  for (const [colonna, valori] of daAllineare) {
    await estendiChoice(token, site, listId, LIST_NAME, colonna, valori)
  }
}

/**
 * Scrive SP_LIST_ASSISTENZA in .env.local: sostituisce la riga se c'è già,
 * la aggiunge in fondo se manca. Fa un backup datato prima di toccare il file.
 */
function scriviEnvLocal(id) {
  const riga = `${ENV_KEY}=${id}`

  if (!existsSync(ENV_PATH)) {
    console.log(`\n⚠ .env.local non trovato. Aggiungi a mano questa riga:\n\n  ${riga}\n`)
    return
  }

  const originale = readFileSync(ENV_PATH, 'utf8')
  const regex = new RegExp(`^\\s*${ENV_KEY}\\s*=.*$`, 'm')

  if (regex.test(originale)) {
    const valoreAttuale = originale.match(regex)[0].split('=').slice(1).join('=').trim()
    if (valoreAttuale === id) {
      console.log(`\n✓ .env.local: ${ENV_KEY} è già corretto.`)
      return
    }
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  writeFileSync(`${ENV_PATH}.bak-${stamp}`, originale)

  const aggiornato = regex.test(originale)
    ? originale.replace(regex, riga)
    : `${originale.replace(/\s*$/, '')}\n\n# Assistenza IT (scritta da scripts/provision-assistenza.mjs)\n${riga}\n`

  writeFileSync(ENV_PATH, aggiornato)
  console.log(`\n✓ .env.local aggiornato: ${riga}`)
  console.log(`  (backup in .env.local.bak-${stamp})`)
}

/**
 * Imposta la variabile su Vercel per i tre ambienti. Se la CLI manca o
 * qualcosa fallisce, stampa i comandi pronti invece di lasciare il lavoro a
 * metà senza dirlo.
 */
function setVercelEnv(id) {
  const hasVercel = spawnSync('vercel', ['--version'], { encoding: 'utf8' }).status === 0
  if (!hasVercel) {
    console.log('\n⚠ CLI Vercel non trovata. Installa con `npm i -g vercel`, poi lancia:')
    printVercelCommands(id)
    return
  }

  console.log('\n→ Imposto la variabile su Vercel (production, preview, development)...')
  let tuttoOk = true
  for (const target of ['production', 'preview', 'development']) {
    // `vercel env add <key> <target>` legge il valore da stdin
    const r = spawnSync('vercel', ['env', 'add', ENV_KEY, target], {
      input: id,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (r.status === 0) {
      console.log(`  ✓ ${target}`)
    } else {
      tuttoOk = false
      const msg = (r.stderr || r.stdout || '').trim().split('\n').slice(-1)[0]
      console.log(`  ✗ ${target} — ${msg || 'errore'} (probabilmente già presente)`)
    }
  }

  if (!tuttoOk) {
    console.log('\nSe un ambiente è fallito perché la variabile esisteva già, rimuovila')
    console.log(`con \`vercel env rm ${ENV_KEY} <ambiente>\` e ripeti, oppure:`)
    printVercelCommands(id)
  } else {
    console.log('\n✓ Variabile impostata su Vercel. Serve un nuovo deploy per applicarla.')
  }
}

function printVercelCommands(id) {
  console.log('')
  for (const target of ['production', 'preview', 'development']) {
    console.log(`  printf '%s' '${id}' | vercel env add ${ENV_KEY} ${target}`)
  }
  console.log('')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
