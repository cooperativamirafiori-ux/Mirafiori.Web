#!/usr/bin/env node
/**
 * Provisioning della sezione "Richieste Acquisto".
 *
 * Fa tre cose, tutte idempotenti:
 *   1. crea (se non esiste) la lista SharePoint "Richieste Acquisto" con le
 *      colonne usate da lib/acquisti.ts;
 *   2. aggiunge i due lookup verso la lista Strutture (Graph non li accetta in
 *      fase di creazione della lista, servono chiamate separate);
 *   2b. allinea i valori delle colonne Choice della lista, così chi ha già
 *      eseguito lo script recupera i valori aggiunti dopo rilanciandolo;
 *   3. estende le colonne Choice della lista "Costi Strutture" con i valori
 *      "Acquisti" (Categoria) e "Acquisto" (Fonte), necessari perché la spesa
 *      di un acquisto consegnato possa entrare nel cruscotto costi.
 *
 * Poi scrive SP_LIST_ACQUISTI in .env.local (con backup) e la imposta su Vercel
 * per production/preview/development, a meno di --no-vercel.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-acquisti.mjs
 *   node scripts/provision-acquisti.mjs --no-vercel   # solo lista + .env.local
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 *   SHAREPOINT_SITE_ID, SP_LIST_STRUTTURE, SP_LIST_COSTI
 *
 * Permesso Graph necessario: Sites.ReadWrite.All (Application).
 * Al termine stampa la riga SP_LIST_ACQUISTI=... da mettere in .env.local e su Vercel.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, '..', '.env.local')
const ENV_KEY = 'SP_LIST_ACQUISTI'

/** --no-vercel: crea solo la lista, senza toccare le variabili su Vercel. */
const SKIP_VERCEL = process.argv.includes('--no-vercel')

const LIST_NAME = 'Richieste Acquisto'

const STATI = [
  'Inviata', 'Presa in carico', 'Approvata', 'Non approvata',
  'Ordinata', 'Consegnata', 'Problema', 'Annullata',
]
const URGENZE = ['Normale', 'Alta', 'Urgente']
const CATEGORIE = [
  'Materiale di consumo', 'Attrezzatura', 'Arredi', 'Informatica', 'Cancelleria',
  'Pulizia e igiene', 'Alimentari', 'DPI e sicurezza', 'Manutenzione', 'Servizi', 'Altro',
]
const PAGAMENTI = ['Fattura posticipata', 'Bonifico', 'Carta', 'Contanti']
// I primi due sono i pulsanti nella mail al richiedente; l'ultimo lo scrive solo
// la chiusura d'ufficio del cron. Devono coincidere con ESITI_SP in types/acquisti.ts.
//
// ⚠️ `estendiChoice` è additivo: togliere un valore da qui NON lo rimuove dalla
// colonna su SharePoint. Per quello serve `node scripts/pulisci-choice.mjs`.
const ESITI = ['Tutto ok', 'Da restituire', 'Consegnata senza riscontro']

// I `name` DEVONO coincidere con quelli usati in lib/acquisti.ts
const COLUMNS = [
  // Richiesta
  { name: 'Richiedente', personOrGroup: { allowMultipleSelection: false, chooseFromType: 'peopleOnly' } },
  { name: 'DataRichiesta', dateTime: { format: 'dateTime', displayAs: 'standard' } },
  { name: 'Descrizione', text: { allowMultipleLines: true } },
  { name: 'Quantita', number: { decimalPlaces: 'none', minimum: 1 } },
  { name: 'LinkRiferimento', text: {} },
  { name: 'Urgenza', choice: { choices: URGENZE, displayAs: 'dropDownMenu' } },
  { name: 'ServeEntro', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'Categoria', choice: { choices: CATEGORIE, displayAs: 'dropDownMenu' } },
  // Gestione
  { name: 'Stato', choice: { choices: STATI, displayAs: 'dropDownMenu' } },
  { name: 'Assegnato', personOrGroup: { allowMultipleSelection: false, chooseFromType: 'peopleOnly' } },
  { name: 'MotivoRifiuto', text: { allowMultipleLines: true } },
  { name: 'NoteInterne', text: { allowMultipleLines: true } },
  // Ordine
  { name: 'Fornitore', text: {} },
  // Imponibile e Totale sono entrambi digitati da chi registra l'ordine:
  // l'aliquota IVA non si chiede più (in fattura può essere mista) e l'IVA si
  // ricava per differenza. Dove la colonna AliquotaIva esiste già resta per i
  // record storici, ma l'app non la legge né la scrive.
  { name: 'Imponibile', currency: { locale: 'it-IT' } },
  { name: 'Totale', currency: { locale: 'it-IT' } },
  { name: 'DataOrdine', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'Pagamento', choice: { choices: PAGAMENTI, displayAs: 'dropDownMenu' } },
  { name: 'DataPagamento', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'DataConsegnaPrevista', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  // Consegna
  { name: 'DataConsegnaEffettiva', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'EsitoConsegna', choice: { choices: ESITI, displayAs: 'dropDownMenu' } },
  { name: 'NoteEsito', text: { allowMultipleLines: true } },
  // Inventario / fiscale
  { name: 'DaInventariare', boolean: {} },
  { name: 'MarcaModello', text: {} },
  { name: 'NumeroSerie', text: {} },
  { name: 'ExtraCee', boolean: {} },
  // Garanzia: la scadenza è calcolata dalla data dell'ordine ma viene salvata,
  // così è filtrabile anche dalla vista SharePoint.
  { name: 'MesiGaranzia', number: { decimalPlaces: 'none' } },
  { name: 'ScadenzaGaranzia', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  // Legame con l'inventario: i numeri assegnati e il flag di idempotenza.
  { name: 'NumeriInventario', text: {} },
  { name: 'InventarioGenerato', boolean: {} },
  // Interni al flusso
  { name: 'ConfermaToken', text: {} },
  { name: 'NotificaConsegnaInviata', boolean: {} },
  { name: 'SollecitoInviato', boolean: {} },
  { name: 'CostoGenerato', boolean: {} },
  { name: 'DigestInviato', boolean: {} },
]

/** Lookup verso la lista Strutture: creati separatamente (vedi nota in testa). */
const LOOKUP_COLUMNS = [
  { name: 'Struttura', displayName: 'Struttura / servizio' },
  { name: 'LuogoConsegna', displayName: 'Luogo di consegna' },
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
    'GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET',
    'SHAREPOINT_SITE_ID', 'SP_LIST_STRUTTURE',
  ]) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const listaStrutture = process.env.SP_LIST_STRUTTURE

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

  await ensureLookups(token, site, listId, listaStrutture)
  await allineaChoiceAcquisti(token, site, listId)
  await estendiCostiStrutture(token, site)

  scriviEnvLocal(listId)
  if (SKIP_VERCEL) {
    console.log('\n(--no-vercel) Passaggio Vercel saltato. Comandi pronti:')
    printVercelCommands(listId)
  } else {
    setVercelEnv(listId)
  }

  console.log('\n============================================================')
  console.log('Fatto. Ultimo passaggio, a mano:')
  console.log('  concedi il permesso "Acquisti" ai gestori')
  console.log('  da Amministrazione → Permessi nell\'app.')
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
 * Crea i lookup verso Strutture. Graph vuole `lookup.listId` + `columnName`
 * (la colonna della lista di origine da mostrare). Usiamo StrutturaLabel se
 * esiste, altrimenti Title.
 */
async function ensureLookups(token, site, listId, listaStrutture) {
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
  const present = new Set((cols.value || []).map((c) => c.name))

  const colsStrutture = await graph(
    token, 'GET', `/sites/${site}/lists/${listaStrutture}/columns?$select=name&$top=200`,
  )
  const nomiStrutture = new Set((colsStrutture.value || []).map((c) => c.name))
  const colonnaMostrata = nomiStrutture.has('StrutturaLabel') ? 'StrutturaLabel' : 'Title'
  console.log(`→ Lookup su Strutture, colonna mostrata: ${colonnaMostrata}`)

  for (const l of LOOKUP_COLUMNS) {
    if (present.has(l.name)) {
      console.log(`✓ Lookup già presente: ${l.name}`)
      continue
    }
    try {
      await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, {
        name: l.name,
        displayName: l.displayName,
        lookup: {
          listId: listaStrutture,
          columnName: colonnaMostrata,
          allowMultipleValues: false,
          allowUnlimitedLength: false,
        },
      })
      console.log(`  + lookup aggiunto: ${l.name} → Strutture.${colonnaMostrata}`)
    } catch (e) {
      // Alcuni tenant non permettono di creare colonne lookup via Graph.
      // Non è un motivo per far fallire tutto il resto: lo si crea a mano.
      console.log(`\n⚠ Lookup "${l.name}" non creato via Graph: ${e.message}`)
      console.log(`  Crealo a mano nella lista "${LIST_NAME}" su SharePoint:`)
      console.log(`    Aggiungi colonna → Ricerca (Lookup)`)
      console.log(`    Nome interno: ${l.name}  ·  Da: Strutture  ·  Colonna: ${colonnaMostrata}`)
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

/**
 * Allinea le Choice della lista Richieste Acquisto. Chi ha già eseguito lo
 * script prima di un'aggiunta di valori li recupera rilanciandolo.
 */
async function allineaChoiceAcquisti(token, site, listId) {
  const daAllineare = [
    ['Stato', STATI],
    ['Urgenza', URGENZE],
    ['Categoria', CATEGORIE],
    ['Pagamento', PAGAMENTI],
    ['EsitoConsegna', ESITI],
  ]
  for (const [colonna, valori] of daAllineare) {
    await estendiChoice(token, site, listId, LIST_NAME, colonna, valori)
  }
}

/**
 * Estende le Choice di "Costi Strutture" con i valori usati dagli acquisti.
 * Senza questo, la riga di costo generata alla consegna verrebbe rifiutata da SP.
 */
async function estendiCostiStrutture(token, site) {
  const listaCosti = process.env.SP_LIST_COSTI
  if (!listaCosti) {
    console.log('⚠ SP_LIST_COSTI non impostata: salto l\'estensione di Costi Strutture.')
    console.log('  Il costo alla consegna non verrà generato finché non la imposti.')
    return
  }

  await estendiChoice(token, site, listaCosti, 'Costi Strutture', 'Categoria', ['Acquisti'])
  await estendiChoice(token, site, listaCosti, 'Costi Strutture', 'Fonte', ['Acquisto'])
}

/**
 * Scrive SP_LIST_ACQUISTI in .env.local: sostituisce la riga se c'è già,
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
    : `${originale.replace(/\s*$/, '')}\n\n# Richieste Acquisto (scritta da scripts/provision-acquisti.mjs)\n${riga}\n`

  writeFileSync(ENV_PATH, aggiornato)
  console.log(`\n✓ .env.local aggiornato: ${riga}`)
  console.log(`  (backup in .env.local.bak-${stamp})`)
}

/**
 * Imposta la variabile su Vercel per i tre ambienti, come fa
 * provision-log-attivita.mjs. Se la CLI manca o qualcosa fallisce, stampa i
 * comandi pronti invece di lasciare il lavoro a metà senza dirlo.
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
    console.log('con `vercel env rm SP_LIST_ACQUISTI <ambiente>` e ripeti, oppure:')
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
