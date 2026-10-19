#!/usr/bin/env node
/**
 * Provisioning della sezione Preventivi su SharePoint.
 *
 * Crea (se mancano) le tre liste con le loro colonne:
 *   - "Preventivi"            → SP_LIST_PREVENTIVI
 *   - "Tariffario Preventivi" → SP_LIST_TARIFFARIO_PREVENTIVI
 *   - "Contatti Preventivi"   → SP_LIST_CONTATTI_PREVENTIVI
 * e trova il drive del sito "docs", dove sta la cartella Preventivi di Andrea
 *   → SP_PREVENTIVI_DRIVE_ID
 *
 * Al primo giro riempie il tariffario con le voci del Preventivo_MASTER.xlsx
 * di Andrea (foglio MATRICE) e della sua Nuova Tabella Generale. Sono valori
 * DI PARTENZA da confermare: il CDA deve ancora fissare i prezzi standard,
 * quindi quasi tutte le voci sono "a prezzo libero" fra un minimo e un massimo.
 * Le rette comunicate dagli enti invece sono bloccate.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-preventivi.mjs
 *   node scripts/provision-preventivi.mjs --senza-tariffe     (non semina)
 *
 * Idempotente: le liste esistenti ricevono solo le colonne mancanti; il
 * tariffario si semina solo se è vuoto.
 * Alla fine scrive da sé le variabili in .env.local; su Vercel le porta
 * scripts/preventivi-env-vercel.sh.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SENZA_TARIFFE = process.argv.includes('--senza-tariffe')
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
    ],
  },
  {
    env: 'SP_LIST_CONTATTI_PREVENTIVI',
    nome: 'Contatti Preventivi',
    colonne: [testo('Ruolo'), testo('Ente'), testo('Email'), testo('Telefono')],
  },
]

// ------------------------------------------------------------
// Tariffario di partenza
// ------------------------------------------------------------
const DAL = '2026-01-01'
const NOTA = 'Valore di partenza dal Preventivo_MASTER di Andrea (19/10/2026): da confermare.'
const IND = ['individuale']
const COM = ['comunita']
const ART = ['artemisia']
const LIB = ['libero']
const v = (codice, voce, gruppo, unita, prezzo, opz = {}) => ({
  codice, voce, gruppo, unita, prezzo,
  bloccato: opz.bloccato ?? false,
  min: opz.min ?? null,
  max: opz.max ?? null,
  iva: opz.iva ?? 'iva5',
  modelli: opz.modelli ?? [],
  ambito: opz.ambito ?? 'Tutti',
  note: opz.note ?? NOTA,
})

const TARIFFE = [
  // Rette (comunicate dagli enti: bloccate)
  v('RETTA_GIULIA', 'Retta giornaliera inserimento residenziale — Comunità Giulia', 'Retta', 'giorno', 123.49, { bloccato: true, modelli: COM, note: 'Quota Comune 60,69 + quota ASL 62,81 (tabella Andrea). ' + NOTA }),
  v('RETTA_GIULIA_DIURNO', 'Retta giornaliera inserimento diurno — Comunità Giulia', 'Retta', 'giorno', 74.4, { bloccato: true, modelli: COM }),
  v('RETTA_CRP', 'Retta giornaliera inserimento residenziale — CRP Cosmica2', 'Retta', 'giorno', 201.78, { bloccato: true, modelli: COM, note: 'Quota Comune 59,09 + quota ASL 142,69 (tabella Andrea). ' + NOTA }),
  v('MAGG_DIURNO', 'Maggiorazione retta giornaliera inserimento diurno', 'Retta', 'giorno', 0, { min: 0, max: 200, modelli: COM }),
  v('RETTA_ART_1', 'Retta residenziale giornaliera Casa Artemisia — 1 ospite', 'Retta', 'giorno', 50.09, { bloccato: true, modelli: ART }),
  v('RETTA_ART_2', 'Retta residenziale giornaliera Casa Artemisia — 2 ospiti', 'Retta', 'giorno', 111.3, { bloccato: true, modelli: ART }),
  v('RETTA_ART_3', 'Retta residenziale giornaliera Casa Artemisia — 3 ospiti', 'Retta', 'giorno', 135.79, { bloccato: true, modelli: ART }),
  v('RETTA_ART_4', 'Retta residenziale giornaliera Casa Artemisia — 4 ospiti', 'Retta', 'giorno', 152.58, { bloccato: true, modelli: ART }),
  v('RETTA_ART_5', 'Retta residenziale giornaliera Casa Artemisia — 5 ospiti', 'Retta', 'giorno', 169.18, { bloccato: true, modelli: ART }),

  // Intervento educativo e sociosanitario (progetti individuali)
  v('EDU_DIRETTO', 'Educatore — rapporto diretto', 'Intervento educativo', 'ora', 23, { min: 20, max: 28.95, modelli: [...IND, ...LIB] }),
  v('EDU_INDIRETTO', 'Educatore — rapporto indiretto', 'Intervento educativo', 'ora', 23, { min: 20, max: 28.95, modelli: IND }),
  v('SOCIOSAN_DIRETTO', 'Intervento sociosanitario — rapporto diretto', 'Intervento sociosanitario', 'ora', 23, { min: 20, max: 28.95, modelli: IND }),
  v('SOCIOSAN_INDIRETTO', 'Intervento sociosanitario — rapporto indiretto', 'Intervento sociosanitario', 'ora', 23, { min: 20, max: 28.95, modelli: IND }),

  // Comunità
  v('ACCOMPAGNAMENTO', 'Accompagnamenti', 'Prestazioni aggiuntive', 'ora', 23, { min: 20, max: 28, modelli: COM }),
  v('PREST_AGG', 'Prestazioni aggiuntive — educatore dedicato', 'Prestazioni aggiuntive', 'ora', 23, { min: 20, max: 28, modelli: COM }),
  v('COP_OSP_COM', 'Copertura ospedaliera', 'Prestazioni aggiuntive', 'ora', 24, { min: 23, max: 26, modelli: COM }),

  // Supervisione e sanitario (tutti i modelli PA)
  v('SUPERVISIONE', 'Supervisione', 'Supervisione', 'ora', 40, { min: 30.91, max: 75, modelli: [...IND, ...COM] }),
  v('PSICHIATRA', 'Psichiatra', 'Intervento sanitario', 'ora', 51.51, { min: 40, max: 75, modelli: IND }),
  v('PSICOTERAPIA', 'Psicoterapia individuale', 'Intervento sanitario', 'ora', 28.95, { min: 20.67, max: 40, modelli: [...IND, ...COM, ...ART] }),

  // Attività a valenza riabilitativa
  v('ONODIDATTICA', 'Onodidattica', 'Attività a valenza riabilitativa', 'ora', 28, { min: 20, max: 75, modelli: [...COM, ...ART] }),
  v('ORTODIDATTICA', 'Ortodidattica', 'Attività a valenza riabilitativa', 'ora', 28, { min: 20, max: 75, modelli: [...IND, ...COM, ...ART] }),
  v('MUSICOTERAPIA', 'Musicoterapia', 'Attività a valenza riabilitativa', 'ora', 28, { min: 20, max: 75, modelli: [...IND, ...COM, ...ART] }),
  v('ARTE_ESPRESSIVA', 'Arte espressiva', 'Attività a valenza riabilitativa', 'ora', 28, { min: 20, max: 75, modelli: [...IND, ...COM, ...ART] }),
  v('ARTE_TERAPIA', 'Arte terapia', 'Attività a valenza riabilitativa', 'ora', 28, { min: 20, max: 75, modelli: [...IND, ...COM, ...ART] }),

  // Casa Artemisia
  v('MEDIATORE', 'Mediatore culturale', 'Altre prestazioni', 'ora', 23, { min: 20, max: 35, modelli: ART }),
  v('OSS', 'Operatore socio sanitario', 'Altre prestazioni', 'ora', 23, { min: 20, max: 28.95, modelli: ART }),
  v('ORIENTAMENTO', 'Orientamento al lavoro', 'Altre prestazioni', 'ora', 23, { min: 20, max: 35, modelli: ART }),
  v('COUNSELING', 'Counseling individuale', 'Altre prestazioni', 'ora', 28.95, { min: 20, max: 40, modelli: ART }),

  // Budget e quota ospitalità: spese F.I.C., fuori dalla base IVA
  v('QUOTA_OSPITALITA', 'Quota mensile ospitalità', 'Budget', 'mese', 0, { min: 0, max: 2000, iva: 'fic', modelli: IND }),
  v('BUDGET', 'Budget mensile previsto', 'Budget', 'mese', 0, { min: 0, max: 2000, iva: 'fic', modelli: [...IND, ...ART], note: 'La cifra del budget è passibile di variazioni secondo gli accordi con l’ente. ' + NOTA }),

  // Rimborso chilometrico
  v('KM', 'Rimborso chilometrico', 'Rimborso chilometrico', 'km', 0.5, { min: 0.5, max: 0.6 }),

  // Privati, scuole, coperture (modello libero)
  v('COP_OSP_EDU', 'Copertura ospedaliera — educatore', 'Intervento educativo', 'ora', 24, { min: 23, max: 26, modelli: LIB }),
  v('COP_OSP_OSS', 'Copertura ospedaliera — OSS', 'Intervento sociosanitario', 'ora', 24, { min: 23, max: 26, modelli: LIB }),
  v('INT_SCUOLA', 'Intervento a scuola — educatore', 'Intervento educativo', 'ora', 25, { min: 23, max: 28, modelli: LIB }),
  v('INT_DOMICILIO', 'Intervento a domicilio — educatore', 'Intervento educativo', 'ora', 25, { min: 23, max: 28, modelli: LIB }),
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

const mezzogiorno = (d) => `${d}T12:00:00Z`

async function seminaTariffe(token, site, listId) {
  const righe = await graph(token, 'GET', `/sites/${site}/lists/${listId}/items?$top=1`)
  if ((righe.value || []).length) {
    console.log('✓ Il tariffario ha già delle voci: non lo tocco')
    return
  }
  let ordine = 10
  for (const t of TARIFFE) {
    await graph(token, 'POST', `/sites/${site}/lists/${listId}/items`, {
      fields: {
        Title: t.voce,
        Codice: t.codice,
        Gruppo: t.gruppo,
        Unita: t.unita,
        Prezzo: t.prezzo,
        Bloccato: t.bloccato,
        ...(t.min !== null ? { PrezzoMin: t.min } : {}),
        ...(t.max !== null ? { PrezzoMax: t.max } : {}),
        RegimeIva: t.iva,
        Modelli: t.modelli.join(';'),
        Ambito: t.ambito,
        ValidoDal: mezzogiorno(DAL),
        Ordine: ordine,
        Note: t.note,
      },
    })
    ordine += 10
  }
  console.log(`✓ Tariffario seminato: ${TARIFFE.length} voci, valide dal ${DAL.split('-').reverse().join('/')}`)
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
  if (!SENZA_TARIFFE) await seminaTariffe(token, site, env.SP_LIST_TARIFFARIO_PREVENTIVI)

  try {
    const docs = await graph(token, 'GET', `/sites/${SITO_DOCS}?$select=id`)
    const drive = await graph(token, 'GET', `/sites/${docs.id}/drive?$select=id,name`)
    env.SP_PREVENTIVI_DRIVE_ID = drive.id
    console.log(`✓ Drive dei preventivi: ${drive.name}`)
  } catch (e) {
    console.log(`⚠️ Drive del sito docs non trovato (${e.message}): SP_PREVENTIVI_DRIVE_ID va messo a mano`)
  }

  scriviEnvLocal(env)
  console.log('\nProssimo passo: bash scripts/preventivi-env-vercel.sh\n')
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
