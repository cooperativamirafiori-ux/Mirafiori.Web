#!/usr/bin/env node
/**
 * Provisioning della sezione "Inventario Beni".
 *
 * Fa quattro cose, tutte idempotenti:
 *   1. crea (se non esiste) la lista SharePoint "Inventario Beni" con le colonne
 *      usate da lib/inventario.ts;
 *   2. aggiunge il lookup verso la lista Strutture (Graph non lo accetta in fase
 *      di creazione della lista, serve una chiamata separata);
 *   3. allinea i valori delle colonne Choice, così chi ha già eseguito lo script
 *      recupera i valori aggiunti dopo rilanciandolo;
 *   4. trova in quale libreria del sito si trova la cartella "Inventario Beni"
 *      (quella condivisa da Controllo Gestione) e la crea se manca.
 *
 * Poi scrive SP_LIST_INVENTARIO, SP_INVENTARIO_DRIVE_ID e SP_INVENTARIO_FOLDER
 * in .env.local (con backup) e le imposta su Vercel, a meno di --no-vercel.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-inventario.mjs
 *   node scripts/provision-inventario.mjs --no-vercel
 *   node scripts/provision-inventario.mjs --cartella "Inventario Beni"
 *   node scripts/provision-inventario.mjs --libreria "Documenti"
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 *   SHAREPOINT_SITE_ID, SP_LIST_STRUTTURE
 *
 * Permesso Graph necessario: Sites.ReadWrite.All (Application).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(__dirname, '..', '.env.local')

const SKIP_VERCEL = process.argv.includes('--no-vercel')

/** Legge il valore di un argomento tipo `--cartella "Nome"`. */
function arg(nome, predefinito) {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito
}

const LIST_NAME = 'Inventario Beni'
const CARTELLA = arg('cartella', 'Inventario Beni')
/** Nome della libreria documenti in cui cercare/creare la cartella, se noto. */
const LIBRERIA = arg('libreria', null)

// Devono coincidere con types/inventario.ts
const STATI_BENE = [
  'In uso', 'In riparazione', 'In magazzino',
  'Dismesso', 'Alienato', 'Smarrito', 'Annullato',
]
// Stesse categorie delle richieste di acquisto: il bene le eredita.
const CATEGORIE = [
  'Materiale di consumo', 'Attrezzatura', 'Arredi', 'Informatica', 'Cancelleria',
  'Pulizia e igiene', 'Alimentari', 'DPI e sicurezza', 'Manutenzione', 'Servizi', 'Altro',
]
// Devono coincidere con types/it.ts
const TIPI_IT = ['PC', 'Smartphone', 'Tablet', 'Stampante', 'Periferiche', 'Rete', 'Altro']
const MODI_ACQUISIZIONE = ['Acquisto', 'Noleggio', 'Donazione']

/** Cartelle fisse dei verbali, alla radice della libreria dell'inventario. */
const CARTELLE_VERBALI = ['Verbali Consegna', 'Verbali Restituzione']

// I `name` DEVONO coincidere con quelli usati in lib/inventario.ts.
// Il Title della lista è il numero di inventario (INV-0001).
const COLUMNS = [
  { name: 'Descrizione', text: { allowMultipleLines: true } },
  { name: 'Categoria', choice: { choices: CATEGORIE, displayAs: 'dropDownMenu' } },
  { name: 'MarcaModello', text: {} },
  { name: 'NumeroSerie', text: {} },
  { name: 'Ubicazione', text: {} },
  { name: 'StatoBene', choice: { choices: STATI_BENE, displayAs: 'dropDownMenu' } },
  { name: 'DataAcquisto', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'Fornitore', text: {} },
  { name: 'Valore', currency: { locale: 'it-IT' } },
  { name: 'MesiGaranzia', number: { decimalPlaces: 'none' } },
  { name: 'ScadenzaGaranzia', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'CodiceRichiesta', text: {} },
  { name: 'RichiestaItemId', text: {} },
  { name: 'CartellaUrl', text: { maxLength: 255 } },
  { name: 'FatturaUrl', text: { maxLength: 255 } },
  { name: 'FatturaNome', text: {} },
  { name: 'GaranziaUrl', text: { maxLength: 255 } },
  { name: 'GaranziaNome', text: {} },
  { name: 'DataDismissione', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'Note', text: { allowMultipleLines: true } },

  // ---- Dispositivi IT (docs/it-dispositivi-piano.md) --------------------
  // `TipoIT` valorizzato è il discriminante: se c'è, il bene è un dispositivo.
  // Non si usa Categoria=Informatica, che è la categoria contabile e la decide
  // chi compra.
  { name: 'TipoIT', displayName: 'Tipo IT', choice: { choices: TIPI_IT, displayAs: 'dropDownMenu' } },
  { name: 'SottoTipo', displayName: 'Sottotipo', text: {} },
  { name: 'Marca', text: {} },
  { name: 'Modello', text: {} },
  { name: 'Acquisizione', choice: { choices: MODI_ACQUISIZIONE, displayAs: 'dropDownMenu' } },
  { name: 'CanoneMensile', displayName: 'Canone mensile', currency: { locale: 'it-IT' } },
  { name: 'FineNoleggio', displayName: 'Fine noleggio', dateTime: { format: 'dateOnly', displayAs: 'standard' } },
  { name: 'GaranzieAccessorie', displayName: 'Garanzie accessorie', text: { allowMultipleLines: true } },
  { name: 'FatturaRif', displayName: 'Fattura rif.', text: {} },
  { name: 'FirewallInstallato', displayName: 'Firewall installato', boolean: {} },
  // Copie dall'assegnazione attiva: le scrive solo l'app (lib/it/flusso.ts).
  { name: 'AssegnatarioMail', displayName: 'Assegnatario (mail)', text: {} },
  { name: 'AssegnatarioNome', displayName: 'Assegnatario (nome)', text: {} },
  // Ponte col registro vecchio dell'IT, es. "DISP-43".
  { name: 'IdListaIT', displayName: 'ID lista IT', text: {} },
]

/**
 * Lookup: Graph non li accetta creando la lista, servono chiamate separate.
 * `env` è la variabile che contiene l'id della lista puntata; se manca, il
 * lookup si salta con un avviso invece di far fallire tutto.
 */
const LOOKUP_COLUMNS = [
  { name: 'Struttura', displayName: 'Struttura / servizio', env: 'SP_LIST_STRUTTURE', preferita: 'StrutturaLabel' },
  { name: 'CentroDiCosto', displayName: 'Centro di costo', env: 'SP_LIST_CENTRI_COSTO' },
]

function loadEnvLocal() {
  try {
    const raw = readFileSync(ENV_PATH, 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const val = m[2].replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = val
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

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/')

async function main() {
  loadEnvLocal()
  for (const k of [
    'GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET',
    'SHAREPOINT_SITE_ID', 'SP_LIST_STRUTTURE',
  ]) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID

  console.log('→ Autenticazione Graph...')
  const token = await getToken()

  // ---- 1. Lista ----------------------------------------------------------
  console.log(`→ Controllo se la lista "${LIST_NAME}" esiste già...`)
  const esistenti = await graph(token, 'GET', `/sites/${site}/lists?$select=id,displayName&$top=200`)
  const trovata = (esistenti.value || []).find((l) => l.displayName === LIST_NAME)

  let listId
  if (trovata) {
    console.log(`✓ La lista esiste già. ID = ${trovata.id}`)
    listId = trovata.id
    await ensureColumns(token, site, listId)
  } else {
    console.log('→ Creazione lista + colonne...')
    const creata = await graph(token, 'POST', `/sites/${site}/lists`, {
      displayName: LIST_NAME,
      list: { template: 'genericList' },
      columns: COLUMNS,
    })
    listId = creata.id
    console.log(`✓ Lista creata. ID = ${listId}`)
  }

  await ensureLookups(token, site, listId)
  await estendiChoice(token, site, listId, LIST_NAME, 'StatoBene', STATI_BENE)
  await estendiChoice(token, site, listId, LIST_NAME, 'Categoria', CATEGORIE)
  await estendiChoice(token, site, listId, LIST_NAME, 'TipoIT', TIPI_IT)
  await estendiChoice(token, site, listId, LIST_NAME, 'Acquisizione', MODI_ACQUISIZIONE)

  // ---- 2. Libreria, cartella radice e cartelle dei verbali ---------------
  const { driveId, cartella } = await trovaCartella(token, site)
  await ensureCartelleVerbali(token, driveId)

  // ---- 3. .env.local e Vercel -------------------------------------------
  const valori = {
    SP_LIST_INVENTARIO: listId,
    SP_INVENTARIO_DRIVE_ID: driveId,
    SP_INVENTARIO_FOLDER: cartella,
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
  console.log('  1. rilancia anche `node scripts/provision-acquisti.mjs` per le')
  console.log('     colonne nuove della richiesta (data pagamento, garanzia, inventario);')
  console.log('  2. fai un nuovo deploy perché Vercel legga le variabili.')
  console.log('============================================================')
}

/** Aggiunge alla lista esistente le sole colonne mancanti (idempotente). */
async function ensureColumns(token, site, listId) {
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
  const presenti = new Set((cols.value || []).map((c) => c.name))
  const mancanti = COLUMNS.filter((c) => !presenti.has(c.name))
  if (!mancanti.length) {
    console.log('✓ Tutte le colonne standard sono già presenti.')
    return
  }
  for (const col of mancanti) {
    await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, col)
    console.log(`  + colonna aggiunta: ${col.name}`)
  }
}

/** Lookup verso Strutture e Centri di Costo. Idempotente. */
async function ensureLookups(token, site, listId) {
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=200`)
  const presenti = new Set((cols.value || []).map((c) => c.name))

  for (const l of LOOKUP_COLUMNS) {
    if (presenti.has(l.name)) {
      console.log(`✓ Lookup già presente: ${l.name}`)
      continue
    }
    const listaPuntata = process.env[l.env]
    if (!listaPuntata) {
      console.log(`⚠ Lookup "${l.name}" saltato: manca ${l.env} in .env.local.`)
      continue
    }

    // La colonna da mostrare: quella preferita se esiste, altrimenti il Title.
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
      console.log(`  + lookup aggiunto: ${l.name} → ${l.env}.${colonnaMostrata}`)
    } catch (e) {
      console.log(`\n⚠ Lookup "${l.name}" non creato via Graph: ${e.message}`)
      console.log(`  Crealo a mano nella lista "${LIST_NAME}" su SharePoint:`)
      console.log(`    Aggiungi colonna → Ricerca (Lookup)`)
      console.log(`    Nome interno: ${l.name}  ·  Colonna mostrata: ${colonnaMostrata}`)
      console.log(`  Il nome interno deve essere esattamente "${l.name}".\n`)
    }
  }
}

/** Le due cartelle fisse dei verbali, alla radice della libreria dei beni. */
async function ensureCartelleVerbali(token, driveId) {
  for (const nome of CARTELLE_VERBALI) {
    const esiste = await graph(
      token, 'GET', `/drives/${driveId}/root:/${encodePath(nome)}?$select=id,webUrl`,
    ).catch(() => null)
    if (esiste) {
      console.log(`✓ Cartella verbali pronta: ${nome}`)
      continue
    }
    const creata = await graph(token, 'POST', `/drives/${driveId}/root/children`, {
      name: nome,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    })
    console.log(`  + cartella creata: ${nome} — ${creata.webUrl ?? ''}`)
  }
}

/** Aggiunge a una Choice i valori che le mancano, senza toccare quelli presenti. */
async function estendiChoice(token, site, listId, etichetta, colonna, valori) {
  const cols = await graph(
    token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=id,name,choice&$top=200`,
  )
  const col = (cols.value || []).find((c) => c.name === colonna)
  if (!col) {
    console.log(`⚠ ${etichetta}: colonna "${colonna}" non trovata, salto.`)
    return
  }
  if (!col.choice) return

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
 * Trova la cartella dei beni.
 *
 * Il link di condivisione che gira in cooperativa non dice in quale libreria
 * stia la cartella, quindi la si cerca: prima una libreria che si chiami come
 * la cartella (caso "libreria dedicata"), poi la cartella dentro la radice di
 * ogni libreria del sito. Se non c'è da nessuna parte la crea nella libreria
 * predefinita, dicendolo.
 */
async function trovaCartella(token, site) {
  const drives = await graph(token, 'GET', `/sites/${site}/drives?$select=id,name,webUrl`)
  const elenco = drives.value || []
  if (!elenco.length) throw new Error('Nessuna libreria documenti trovata sul sito.')

  if (LIBRERIA) {
    const scelta = elenco.find((d) => d.name === LIBRERIA)
    if (!scelta) {
      throw new Error(
        `Libreria "${LIBRERIA}" non trovata. Disponibili: ${elenco.map((d) => d.name).join(', ')}`,
      )
    }
    return assicura(token, scelta, CARTELLA)
  }

  // Caso libreria dedicata: si chiama proprio come la cartella cercata.
  const dedicata = elenco.find((d) => d.name === CARTELLA)
  if (dedicata) {
    console.log(`✓ Libreria dedicata trovata: "${dedicata.name}"`)
    console.log(`  ${dedicata.webUrl}`)
    // "." = radice della libreria: nessuna sottocartella
    // "Inventario Beni/Inventario Beni", che sarebbe un livello inutile.
    return { driveId: dedicata.id, cartella: '.' }
  }

  for (const d of elenco) {
    const esiste = await graph(
      token, 'GET',
      `/drives/${d.id}/root:/${encodePath(CARTELLA)}?$select=id,webUrl`,
    ).catch(() => null)
    if (esiste) {
      console.log(`✓ Cartella "${CARTELLA}" trovata nella libreria "${d.name}"`)
      console.log(`  ${esiste.webUrl}`)
      return { driveId: d.id, cartella: CARTELLA }
    }
  }

  const predefinita = elenco[0]
  console.log(`⚠ Cartella "${CARTELLA}" non trovata in nessuna libreria del sito.`)
  console.log(`  La creo nella libreria "${predefinita.name}".`)
  console.log('  Se i beni devono stare altrove, rilancia con:')
  console.log(`    node scripts/provision-inventario.mjs --libreria "<nome libreria>"`)
  return assicura(token, predefinita, CARTELLA)
}

async function assicura(token, drive, cartella) {
  if (!cartella || cartella === '.') return { driveId: drive.id, cartella: '.' }
  const esiste = await graph(
    token, 'GET', `/drives/${drive.id}/root:/${encodePath(cartella)}?$select=id,webUrl`,
  ).catch(() => null)
  if (esiste) {
    console.log(`✓ Cartella pronta in "${drive.name}": ${esiste.webUrl}`)
    return { driveId: drive.id, cartella }
  }
  const creata = await graph(token, 'POST', `/drives/${drive.id}/root/children`, {
    name: cartella,
    folder: {},
    '@microsoft.graph.conflictBehavior': 'fail',
  })
  console.log(`  + cartella creata in "${drive.name}": ${creata.webUrl ?? cartella}`)
  return { driveId: drive.id, cartella }
}

/**
 * Scrive le variabili in .env.local: sostituisce le righe già presenti,
 * aggiunge le mancanti in fondo. Backup datato prima di toccare il file.
 */
function scriviEnvLocal(valori) {
  const righe = Object.entries(valori).map(([k, v]) => `${k}=${v}`)

  if (!existsSync(ENV_PATH)) {
    console.log('\n⚠ .env.local non trovato. Aggiungi a mano queste righe:\n')
    righe.forEach((r) => console.log(`  ${r}`))
    console.log('')
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
      `${aggiornato.replace(/\s*$/, '')}\n\n# Inventario Beni (scritta da scripts/provision-inventario.mjs)\n` +
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

/** Imposta le variabili su Vercel per i tre ambienti. */
function setVercelEnv(valori) {
  const hasVercel = spawnSync('vercel', ['--version'], { encoding: 'utf8' }).status === 0
  if (!hasVercel) {
    console.log('\n⚠ CLI Vercel non trovata. Installa con `npm i -g vercel`, poi lancia:')
    printVercelCommands(valori)
    return
  }

  console.log('\n→ Imposto le variabili su Vercel (production, preview, development)...')
  let tuttoOk = true
  for (const [chiave, valore] of Object.entries(valori)) {
    for (const target of ['production', 'preview', 'development']) {
      const r = spawnSync('vercel', ['env', 'add', chiave, target], {
        input: String(valore),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      if (r.status === 0) {
        console.log(`  ✓ ${chiave} · ${target}`)
      } else {
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
