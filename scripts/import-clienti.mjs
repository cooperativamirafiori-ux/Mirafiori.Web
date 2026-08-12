#!/usr/bin/env node
/**
 * Import dell'anagrafica clienti dall'export del gestionale di fatturazione
 * nella lista SharePoint "Clienti".
 *
 * Uso (dalla cartella web/):
 *   node scripts/import-clienti.mjs ../clienti.csv --prova     ← non scrive niente
 *   node scripts/import-clienti.mjs ../clienti.csv             ← scrive
 *
 * Richiede SP_LIST_CLIENTI in .env.local (lo stampa provision-clienti.mjs).
 *
 * **Formati accettati: .csv e .xlsx.** Il primo export del gestionale era un
 * .xlsx che exceljs non riesce a leggere (le stringhe condivise usano il
 * prefisso `x:`, cosa che fanno gli esportatori .NET); da lì la lettura del CSV,
 * che non dipende da nessuna libreria e non si rompe. Se l'xlsx dà errore di
 * parsing, aprilo e salvalo come CSV: il resto funziona identico.
 *
 * **La riga delle intestazioni la cerca da sé**: è la prima che contiene
 * "Ragione sociale" (nell'export sono alla quarta, sopra c'è il titolo del
 * report). Colonne attese: Ragione sociale, Nome, Cognome, Tipologia,
 * Indirizzo, Comune, CAP, Provincia, Nazione, Partita IVA, Codice Fiscale,
 * Codice Identificativo Estero, Cellulare, Telefono, Email, PEC, Codice B2B,
 * Codice IPA, Scadenza, Tipo Pagamento, Addebito Bollo.
 *
 * **Doppioni.** Nell'export ci sono 13 gruppi di righe che condividono partita
 * IVA o codice fiscale, e non sono tutti doppioni: Comune di Torino e il suo
 * ufficio ITER, i tre dipartimenti dell'Università, le tre sedi di ENGIM, ASL
 * Città di Torino 1 e 2, Città della Salute e il suo ufficio Formazione sono
 * **soggetti distinti** con referenti e recapiti propri. Unirli perderebbe
 * l'informazione che serve a fatturare, quindi restano righe separate.
 * Si uniscono solo i gruppi elencati in UNIONI, verificati uno per uno con
 * Dennis il 12 agosto 2026: si tiene la riga indicata e si riempiono i suoi
 * campi vuoti con quelli delle altre.
 *
 * È idempotente: le righe già presenti nella lista (stessa denominazione e
 * stessi codici) vengono saltate, quindi si può rilanciare senza duplicare.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import ExcelJS from 'exceljs'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** La colonna che identifica la riga delle intestazioni. */
const COLONNA_GUIDA = 'Ragione sociale'

/** key = partita IVA (o CF se manca) → denominazione della riga da tenere. */
const UNIONI = {
  '03292340043': 'CEPHEUS VIAGGI DI STEFANO TIRELLO',
  '06735300011': 'POLIEDRA S.P.A.',
  '07306200010': 'CISA GASSINO',
  '08645920011': 'A.G.P. GAS SRL',
  '09698100014': 'BONO E GUZZINO SNC DI GUZZINO FILIPPO,GUZZINO ROBE',
  '97694100013': 'MIRAVOLANTE APS',
  '12411260016': 'Rete delle Case del Quartiere ETS',
  'GRGGPP70A47L219S': 'GARGANO GIUSEPPINA',
}

/** Colonna del file → colonna SharePoint. Il Title è la denominazione. */
const MAPPA = {
  'Ragione sociale': 'Title',
  Cognome: 'Cognome',
  Nome: 'Nome',
  Tipologia: 'TipoSoggetto',
  Indirizzo: 'Indirizzo',
  Comune: 'Comune',
  CAP: 'Cap',
  Provincia: 'Provincia',
  Nazione: 'Nazione',
  'Partita IVA': 'PartitaIVA',
  'Codice Fiscale': 'CodiceFiscale',
  'Codice Identificativo Estero': 'CodiceEstero',
  Cellulare: 'Cellulare',
  Telefono: 'Telefono',
  Email: 'Email',
  PEC: 'Pec',
  'Codice B2B': 'CodiceSdi',
  'Codice IPA': 'CodiceIpa',
  Scadenza: 'Scadenza',
  'Tipo Pagamento': 'TipoPagamento',
  'Addebito Bollo': 'AddebitoBollo',
}

// ============================================================
// Env e Graph
// ============================================================

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // .env.local assente
  }
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

/** Chiamata Graph con un ritentativo sulle limitazioni (429/503). */
async function graph(token, method, path, body, tentativo = 0) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if ((res.status === 429 || res.status === 503) && tentativo < 4) {
    const attesa = Number(res.headers.get('retry-after') ?? 0) * 1000 || 2000 * (tentativo + 1)
    console.log(`    (SharePoint chiede di rallentare: aspetto ${attesa / 1000}s)`)
    await new Promise((r) => setTimeout(r, attesa))
    return graph(token, method, path, body, tentativo + 1)
  }
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

// ============================================================
// Lettura del file
// ============================================================

function pulisci(v) {
  if (v == null) return ''
  // Le celle di exceljs possono essere oggetti: formule, link, testo ricco.
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text).trim()
    if (v.result != null) return String(v.result).trim()
    if (v.richText) return v.richText.map((t) => t.text).join('').trim()
    if (v.hyperlink) return String(v.text ?? v.hyperlink).trim()
    return ''
  }
  return String(v).trim()
}

/** Divide una riga CSV rispettando le virgolette e i separatori dentro il testo. */
function dividiRigaCsv(riga, sep) {
  const celle = []
  let cella = ''
  let dentroVirgolette = false
  for (let i = 0; i < riga.length; i++) {
    const ch = riga[i]
    if (dentroVirgolette) {
      if (ch === '"') {
        if (riga[i + 1] === '"') {
          cella += '"'
          i++
        } else dentroVirgolette = false
      } else cella += ch
    } else if (ch === '"') dentroVirgolette = true
    else if (ch === sep) {
      celle.push(cella)
      cella = ''
    } else cella += ch
  }
  celle.push(cella)
  return celle
}

/** Il file come matrice di stringhe, qualunque sia il formato. */
async function leggiMatrice(percorso) {
  if (/\.csv$/i.test(percorso)) {
    let testo = readFileSync(percorso, 'utf8')
    if (testo.charCodeAt(0) === 0xfeff) testo = testo.slice(1) // BOM di Excel
    const righe = testo.split(/\r?\n/)
    // Punto e virgola o virgola: si guarda quale compare di più nella riga
    // delle intestazioni, non nella prima riga (che può essere un titolo).
    const guida = righe.find((r) => r.includes(COLONNA_GUIDA)) ?? righe[0] ?? ''
    const sep = (guida.match(/;/g) ?? []).length > (guida.match(/,/g) ?? []).length ? ';' : ','
    return righe.map((r) => dividiRigaCsv(r, sep).map((c) => c.trim()))
  }

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.readFile(percorso)
  } catch (err) {
    throw new Error(
      `Non riesco a leggere l'xlsx (${err.message}).\n` +
        '  Apri il file, salvalo come CSV e rilancia lo script su quello.',
    )
  }
  const ws = wb.worksheets[0]
  const matrice = []
  ws.eachRow({ includeEmpty: true }, (row, numero) => {
    const riga = []
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      riga[col - 1] = pulisci(cell.value)
    })
    matrice[numero - 1] = riga
  })
  return matrice
}

async function leggiFile(percorso) {
  const matrice = await leggiMatrice(percorso)

  const iIntestazioni = matrice.findIndex((r) => (r ?? []).some((c) => c === COLONNA_GUIDA))
  if (iIntestazioni < 0) {
    throw new Error(`Non trovo la riga delle intestazioni: nessuna cella contiene "${COLONNA_GUIDA}"`)
  }
  const intestazioni = matrice[iIntestazioni].map((c) => (c ?? '').trim())

  const attese = Object.keys(MAPPA)
  const mancanti = attese.filter((a) => !intestazioni.includes(a))
  if (mancanti.length) {
    throw new Error(
      `Il file non ha la struttura attesa. Colonne mancanti alla riga ${iIntestazioni + 1}: ${mancanti.join(', ')}`,
    )
  }

  const righe = []
  for (let i = iIntestazioni + 1; i < matrice.length; i++) {
    const cells = matrice[i]
    if (!cells) continue
    const r = { _riga: i + 1 }
    intestazioni.forEach((nome, col) => {
      if (nome) r[nome] = (cells[col] ?? '').trim()
    })
    if (attese.some((a) => r[a])) righe.push(r)
  }
  return righe
}

const chiave = (r) =>
  (r['Partita IVA'] || '').replace(/\s/g, '').toUpperCase() ||
  (r['Codice Fiscale'] || '').replace(/\s/g, '').toUpperCase()

// ============================================================
// Unione dei doppioni
// ============================================================

function unisci(righe) {
  const gruppi = new Map()
  for (const r of righe) {
    const k = chiave(r)
    if (!k) {
      gruppi.set(`__senza_codice_${r._riga}`, [r])
      continue
    }
    if (!gruppi.has(k)) gruppi.set(k, [])
    gruppi.get(k).push(r)
  }

  const finali = []
  const unite = []
  const separate = []

  for (const [k, gruppo] of gruppi) {
    if (gruppo.length === 1) {
      finali.push(gruppo[0])
      continue
    }
    const tieni = UNIONI[k]
    if (!tieni) {
      separate.push({ chiave: k, nomi: gruppo.map((r) => r['Ragione sociale']) })
      finali.push(...gruppo)
      continue
    }
    const base = gruppo.find((r) => r['Ragione sociale'] === tieni)
    if (!base) {
      throw new Error(
        `UNIONI dice di tenere "${tieni}" per ${k}, ma quella riga non c'è nel file. Righe presenti: ${gruppo
          .map((r) => r['Ragione sociale'])
          .join(' | ')}`,
      )
    }
    const altre = gruppo.filter((r) => r !== base)
    const riempiti = []
    for (const col of Object.keys(MAPPA)) {
      if (base[col]) continue
      const donatrice = altre.find((r) => r[col])
      if (donatrice) {
        base[col] = donatrice[col]
        riempiti.push(col)
      }
    }
    unite.push({
      chiave: k,
      tenuta: tieni,
      scartate: altre.map((r) => r['Ragione sociale']),
      riempiti,
    })
    finali.push(base)
  }

  return { finali, unite, separate }
}

// ============================================================
// Scrittura
// ============================================================

function fieldsDa(r) {
  const f = {}
  for (const [colonna, campo] of Object.entries(MAPPA)) {
    const v = r[colonna] ?? ''
    if (v) f[campo] = v
  }
  if (!f.Title) f.Title = [r.Cognome, r.Nome].filter(Boolean).join(' ') || '(senza nome)'
  return f
}

/** Righe già in lista: denominazione + codici. Serve a poter rilanciare l'import. */
async function leggiEsistenti(token, site, list) {
  const presenti = new Set()
  let url = `/sites/${site}/lists/${list}/items?$select=id&$expand=fields($select=Title,PartitaIVA,CodiceFiscale)&$top=500`
  while (url) {
    const res = await graph(token, 'GET', url)
    for (const item of res.value ?? []) {
      const f = item.fields ?? {}
      presenti.add(`${(f.Title ?? '').toLowerCase()}|${f.PartitaIVA ?? ''}|${f.CodiceFiscale ?? ''}`)
    }
    const next = res['@odata.nextLink']
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : undefined
  }
  return presenti
}

/** Scrive a piccoli gruppi paralleli: 725 richieste in fila sarebbero minuti. */
async function scriviTutti(token, site, list, righe) {
  const PARALLELE = 4
  let fatti = 0
  const errori = []
  for (let i = 0; i < righe.length; i += PARALLELE) {
    const lotto = righe.slice(i, i + PARALLELE)
    await Promise.all(
      lotto.map(async (r) => {
        try {
          await graph(token, 'POST', `/sites/${site}/lists/${list}/items`, { fields: fieldsDa(r) })
          fatti++
        } catch (err) {
          errori.push({ riga: r._riga, nome: r['Ragione sociale'], errore: err.message })
        }
      }),
    )
    if (fatti % 50 < PARALLELE) console.log(`  … ${fatti}/${righe.length}`)
  }
  return { fatti, errori }
}

// ============================================================

async function main() {
  loadEnvLocal()
  const args = process.argv.slice(2)
  const prova = args.includes('--prova')
  const percorso = args.find((a) => !a.startsWith('--'))
  if (!percorso) throw new Error('Manca il percorso del file: node scripts/import-clienti.mjs ../Clienti_Full.xlsx')

  console.log(`→ Leggo ${percorso}`)
  const righe = await leggiFile(resolve(process.cwd(), percorso))
  console.log(`✓ ${righe.length} righe nel file`)

  const { finali, unite, separate } = unisci(righe)

  console.log(`\n→ Doppioni uniti: ${unite.length} gruppi`)
  for (const u of unite) {
    console.log(`  ${u.chiave}  tengo: ${u.tenuta}`)
    console.log(`      scarto: ${u.scartate.join(' | ')}`)
    if (u.riempiti.length) console.log(`      campi presi dalla riga scartata: ${u.riempiti.join(', ')}`)
  }

  console.log(`\n→ Stessa partita IVA ma soggetti distinti, lasciati separati: ${separate.length} gruppi`)
  for (const s of separate) console.log(`  ${s.chiave}  ${s.nomi.join(' | ')}`)

  const senzaCodici = finali.filter((r) => !chiave(r))
  console.log(`\n→ Righe senza partita IVA né codice fiscale: ${senzaCodici.length} (importate comunque)`)

  console.log(`\n=== Da importare: ${finali.length} clienti ===`)

  if (prova) {
    console.log('\n(--prova: non ho scritto niente. Rilancia senza --prova per importare.)')
    console.log('\nEsempio di prima riga come finirebbe su SharePoint:')
    console.log(JSON.stringify(fieldsDa(finali[0]), null, 2))
    return
  }

  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_CLIENTI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const list = process.env.SP_LIST_CLIENTI

  console.log('\n→ Autenticazione Graph...')
  const token = await getToken()

  console.log('→ Controllo cosa c\'è già in lista...')
  const presenti = await leggiEsistenti(token, site, list)
  const daScrivere = finali.filter((r) => {
    const f = fieldsDa(r)
    return !presenti.has(
      `${(f.Title ?? '').toLowerCase()}|${f.PartitaIVA ?? ''}|${f.CodiceFiscale ?? ''}`,
    )
  })
  console.log(`✓ già presenti: ${finali.length - daScrivere.length} — da scrivere: ${daScrivere.length}`)

  if (!daScrivere.length) {
    console.log('\nNiente da fare.')
    return
  }

  console.log('\n→ Scrivo...')
  const { fatti, errori } = await scriviTutti(token, site, list, daScrivere)
  console.log(`\n✓ Importati ${fatti} clienti`)
  if (errori.length) {
    console.log(`\n✗ ${errori.length} righe non importate:`)
    for (const e of errori) console.log(`  riga ${e.riga} — ${e.nome}: ${e.errore}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
