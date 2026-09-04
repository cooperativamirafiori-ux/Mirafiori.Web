#!/usr/bin/env node
/**
 * Provisioning delle liste SharePoint dell'area Risorse Umane:
 *   - "Dipendenti"     (da PROFILO SOGGETTO — include anche i Collaboratori,
 *                        unificati qui il 2026-07 e distinti dal campo CategoriaRU)
 *   - "Tirocini"       (da TIROCINI)
 *
 * NB: la vecchia lista "Collaboratori" è stata eliminata dopo l'unificazione
 * (vedi migrate-unifica-collaboratori-2026-07.mjs ed
 * elimina-lista-collaboratori.mjs): non viene più provisionata qui apposta,
 * per non farla ricomparire a un rilancio futuro di questo script.
 *
 * Crea (se non esistono) le liste con tutte le colonne usate da lib/risorse-umane.ts.
 * Idempotente: se una lista esiste già aggiunge solo le colonne mancanti.
 *
 * Uso (dalla cartella web/):
 *   node scripts/provision-risorse-umane.mjs                 # sito da SP_SITE_RU o SHAREPOINT_SITE_ID
 *   node scripts/provision-risorse-umane.mjs --site=<siteId> # sito esplicito (es. nuovo sito RU)
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET
 * e un sito bersaglio (--site, SP_SITE_RU o SHAREPOINT_SITE_ID)
 * Permesso Graph: Sites.ReadWrite.All (Application) — già presente.
 *
 * Al termine stampa le righe SP_LIST_DIPENDENTI / SP_LIST_TIROCINI
 * da incollare in .env.local e nelle Environment Variables su Vercel.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ------------------------------------------------------------------
// Valori "choice" (a tendina). I `name` DEVONO coincidere con lib/risorse-umane.ts
// ------------------------------------------------------------------
const GENERE = ['Maschio', 'Femmina']
const SINO = ['Si', 'No']
const AREA_GEO = ['Comunitario', 'Extracomunitario']
const STATO_CIVILE = ['Celibe', 'Nubile', 'Coniugato/a', 'Convivente', 'Separato/a', 'Vedovo/a']
const TITOLO_STUDIO = [
  'Licenza media', 'Diploma Prof (PostLicenMedia)', 'Diploma scuola superiore',
  'Diploma Prof (PostScuoSup)', 'Laurea', 'Laurea triennale', 'Master I livello',
  'Laurea magistrale', 'Master II livello', 'Dottorato di ricerca',
  'Qualifica Professionale', 'Altro',
]
const TIPO_CONTRATTO = [
  'Determinato Tempo Pieno', 'Determinato Tempo Parziale',
  'Indeterminato Tempo Pieno', 'Indeterminato Tempo Parziale',
  'Intermittente Tempo Determinato',
]
const TIPO_RAPPORTO = [
  'Dipendente', 'Libero professionista', 'Socio lavoratore', 'Socio volontario',
  'Socio libero professionista', 'Tirocinante e/o Stagista', 'Volontario in servizio civile',
  'Socio fruitore', 'Socio persona giuridica', 'Socio sovventore e finanziatore',
  'Apprendista', 'Collaborazione Coordinate Continuativa',
]
const AREA_ASSUNZIONE = ['Tipo A', 'Tipo B']
const LIVELLO = ['A1', 'A2', 'B1', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3', 'E1', 'E2', 'F1', 'F2']
const MANSIONE = [
  'ADEST', 'Assistente Sociale', 'Assistente alla persona', 'Addetto alle pulizie',
  'Addetto alla sala', 'Addetto mensa', 'Addetto manutenzione aree verdi', 'Aiuto cuoco',
  'Aiuto Bibliotecaria', 'Animatore', 'Autista', 'Barista', 'Bibliotecario', 'Cuoco',
  'Coordinatore AS', 'Cameriere', 'Dirigente quadro', 'Educatore', 'Educatore Coordinatore',
  'Educatore quadro', 'Educatore prima infanzia', 'Grafico', 'Guida Museale', 'Infermiere',
  'Impiegato', 'Lava piatti', 'Logopedista', 'Maestra', 'Mediatore culturale',
  "Operatore dell'inserimento lavorativo", 'OSS', 'Pizzaiolo', 'Psicologo', 'Sociologo',
  'Supervisore', 'Segretario', 'Tirocinante',
]
const SERVIZIO = ['Locanda', 'Residenziale', 'Ambientale', 'Biblioteche', 'Ufficio', 'Scuola', 'Comunità Giulia', 'Cosmica2']
const TIPOLOGIA_SVANTAGGIO = [
  'DISABILITA FISICA E/O SENSORIALE', 'DISABILITA PSICHICA', 'DIPENDENZA PATOLOGICA',
  'MINORE IN ETA LAVORATIVA IN NUCLEO FAMILIARE VULNERABILE', 'DETENUTO IN REGIME ALTERNATIVO',
  'DISAGIO SOCIALE O MOLTO SVANTAGGIATE', 'ALTRO',
]
const STATO_TIROCINIO = ['ATTIVO', 'INTERROTTO', 'TERMINATO']
const CATEGORIA_COLLAB = ['TIROCINIO', 'SERVIZIO CIVILE']
const STATO_RAPPORTO = [
  'Attivo', 'Aspettativa', 'Maternità', 'Congedo parentale',
  'Malattia lunga', 'Sospeso', 'Cessato',
]
const CATEGORIA_RU = ['Dipendente', 'Collaboratore']
const ALBO = [
  'Albo Assistenti Sociali',
  'Albo Educatori Professionali (socio-sanitari)',
  'Albo Educatori socio-pedagogici',
  'Albo Pedagogisti',
  'Albo Psicologi',
  'Albo Infermieri (OPI)',
  'Albo Logopedisti',
  'Albo Tecnici della Riabilitazione Psichiatrica',
  'Albo generico',
]

const choice = (choices) => ({ choice: { choices, displayAs: 'dropDownMenu', allowTextEntry: true } })
const text = (multi = false) => ({ text: { allowMultipleLines: multi } })
const number = () => ({ number: {} })
const currency = () => ({ currency: { locale: 'it-IT' } })
const dateOnly = () => ({ dateTime: { format: 'dateOnly', displayAs: 'standard' } })

// ------------------------------------------------------------------
// BLOCCO COMUNE — colonne condivise da TUTTE le liste RU.
// Deve rispecchiare il "BLOCCO COMUNE" di types/risorse-umane.ts:
// se aggiungi lì un campo comune, aggiungilo qui e rilancia lo script.
// ------------------------------------------------------------------
const COMUNE_COLS = [
  { name: 'IdAccess', ...number() },
  { name: 'Cognome', ...text() },
  { name: 'Nome', ...text() },
  { name: 'Genere', ...choice(GENERE) },
  { name: 'DataNascita', ...dateOnly() },
  { name: 'LuogoNascita', ...text() },
  { name: 'CodiceFiscale', ...text() },
  { name: 'Nazionalita', ...text() },
  { name: 'AreaGeografica', ...choice(AREA_GEO) },
  { name: 'StatoCivile', ...choice(STATO_CIVILE) },
  // 'Residenza', 'Domicilio' e 'CittaResidenza' (storiche, dismesse dallo
  // schema/UI il 2026-08-07/08-08, sostituite dai 6 campi sotto — Indirizzo/
  // CAP/Comune per Residenza e per Domicilio, popolati a mano da Dennis nel
  // file "Dipendenti_indirizzi_split.xlsx" e scritti con
  // scripts/applica-indirizzi-split.mjs): non ricreate qui, ma NON vanno
  // eliminate dalla lista SharePoint — restano come storico/backup.
  { name: 'IndirizzoResidenza', ...text() },
  { name: 'CapResidenza', ...text() },
  { name: 'ComuneResidenza', ...text() },
  { name: 'IndirizzoDomicilio', ...text() },
  { name: 'CapDomicilio', ...text() },
  { name: 'ComuneDomicilio', ...text() },
  { name: 'CellAziendale', ...text() },
  { name: 'CellPrivato', ...text() },
  { name: 'MailAziendale', ...text() },
  { name: 'MailPersonale', ...text() },
  { name: 'TitoloStudio', ...choice(TITOLO_STUDIO) },
  // Sezione Timbrature (vedi TIMBRATURE_COMUNE in types/risorse-umane.ts).
  // Chiave di collegamento col database timbrature: MailAziendale.
  { name: 'TimbraturaAttiva', ...choice(SINO) },
  // "Non timbra": va insieme a TimbraturaAttiva, non al suo posto. Il foglio
  // ore si genera dall'orario teorico invece di essere compilato ogni giorno.
  { name: 'NonTimbra', ...choice(SINO) },
  { name: 'ReferenteFoglioOre', ...text() },
]
const NOTE_COL = { name: 'Note', ...text(true) }

/** Compone le colonne di una lista: blocco comune + specifiche + Note. */
const conComuneCols = (specifiche) => [...COMUNE_COLS, ...specifiche, NOTE_COL]

// ------------------------------------------------------------------
// Definizione liste = blocco comune + colonne specifiche
// ------------------------------------------------------------------
const DIPENDENTI_SPEC = [
  { name: 'CategoriaRU', ...choice(CATEGORIA_RU) },
  { name: 'Matricola', ...text() },
  { name: 'MatricolaPulse', ...text() },
  { name: 'Qualifica', ...text() },
  { name: 'Albo', ...choice(ALBO) },
  { name: 'StatoRapporto', ...choice(STATO_RAPPORTO) },
  { name: 'DataAssunzione', ...dateOnly() },
  { name: 'OreLavoroPreviste', ...number() },
  { name: 'TipoContratto', ...choice(TIPO_CONTRATTO) },
  { name: 'DataScadenzaContratto', ...dateOnly() },
  { name: 'TipoRapporto', ...choice(TIPO_RAPPORTO) },
  { name: 'AreaAssunzione', ...choice(AREA_ASSUNZIONE) },
  { name: 'LivelloContrattuale', ...choice(LIVELLO) },
  { name: 'Mansione', ...choice(MANSIONE) },
  { name: 'ServizioAppartenenza', ...choice(SERVIZIO) },
  { name: 'IBAN', ...text() },
  { name: 'AdesioneFondoPensione', ...choice(SINO) },
  { name: 'FondoPensioneDettaglio', ...text() },
  { name: 'Socio', ...choice(SINO) },
  { name: 'NumeroElencoGenerale', ...number() },
  { name: 'DataAmmissioneSocio', ...dateOnly() },
  { name: 'QuotaSociale', ...currency() },
  { name: 'QuotaSocialeVersata', ...currency() },
  { name: 'QuotaSocialeRestituita', ...currency() },
  { name: 'DataRestituzioneQuota', ...dateOnly() },
  { name: 'DataDimissioneLavoratore', ...dateOnly() },
  { name: 'DataDimissioneSocio', ...dateOnly() },
  { name: 'InvalidoSvantaggiato', ...choice(SINO) },
  { name: 'TipologiaSvantaggio', ...choice(TIPOLOGIA_SVANTAGGIO) },
  { name: 'Legge104', ...choice(SINO) },
  { name: 'StatoFamiglia', ...text() },
  { name: 'FondoCoopersalute', ...text() },
  { name: 'StatoServizio', ...text(true) },
  { name: 'CartellaUrl', ...text() },
]

const TIROCINI_SPEC = [
  { name: 'RecapitoTelefonico', ...text() }, // storico: dismesso dallo schema/UI, tenuto per i dati e la migrazione
  { name: 'LivelloIstruzione', ...text() },  // storico: dismesso dallo schema/UI, tenuto per i dati e la migrazione
  { name: 'CategoriaTirocinante', ...text() },
  { name: 'TipologiaTirocinio', ...text() },
  { name: 'AttivitaAteco', ...text() },
  { name: 'SoggettoOspitante', ...text() },
  { name: 'DataInizio', ...dateOnly() },
  { name: 'DataFine', ...dateOnly() },
  { name: 'DurataMesi', ...number() },
  { name: 'ImpegnoOrarioSettimanale', ...text() },
  { name: 'IndennitaMensileLorda', ...currency() },
  { name: 'StatoTirocinio', ...choice(STATO_TIROCINIO) },
  { name: 'CategoriaCollaborazione', ...choice(CATEGORIA_COLLAB) },
]

const LISTE = [
  { envKey: 'SP_LIST_DIPENDENTI', displayName: 'Dipendenti', columns: conComuneCols(DIPENDENTI_SPEC) },
  { envKey: 'SP_LIST_TIROCINI', displayName: 'Tirocini', columns: conComuneCols(TIROCINI_SPEC) },
]

// ------------------------------------------------------------------
// Helper Graph
// ------------------------------------------------------------------
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const val = m[2].replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = val
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
  const t = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${t}`)
  return t ? JSON.parse(t) : {}
}

async function ensureColumns(token, site, listId, columns) {
  const cols = await graph(token, 'GET', `/sites/${site}/lists/${listId}/columns?$select=name&$top=300`)
  const present = new Set((cols.value || []).map((c) => c.name))
  const mancanti = columns.filter((c) => !present.has(c.name))
  if (!mancanti.length) { console.log('    ✓ colonne già tutte presenti'); return }
  for (const col of mancanti) {
    await graph(token, 'POST', `/sites/${site}/lists/${listId}/columns`, col)
    console.log(`    + colonna: ${col.name}`)
  }
}

async function provisionList(token, site, def) {
  console.log(`\n→ Lista "${def.displayName}"`)
  const existing = await graph(token, 'GET', `/sites/${site}/lists?$select=id,displayName&$top=300`)
  const found = (existing.value || []).find((l) => l.displayName === def.displayName)
  let id
  if (found) {
    id = found.id
    console.log(`  ✓ esiste già (ID = ${id}) — verifico colonne`)
    await ensureColumns(token, site, id, def.columns)
  } else {
    const created = await graph(token, 'POST', `/sites/${site}/lists`, {
      displayName: def.displayName,
      list: { template: 'genericList' },
      columns: def.columns,
    })
    id = created.id
    console.log(`  ✓ creata (ID = ${id})`)
  }
  return id
}

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }

  // Sito bersaglio: --site=<id> > SP_SITE_RU > SHAREPOINT_SITE_ID.
  // Serve per provisionare le liste sul nuovo sito dedicato Risorse Umane
  // (vedi docs/piano-ru-sito-dedicato-accesso-delegato.md, passo 3).
  const argSite = process.argv.find((a) => a.startsWith('--site='))?.slice(7)
  const site = argSite || process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  if (!site) {
    throw new Error('Sito non indicato: usa --site=<siteId> oppure imposta SP_SITE_RU / SHAREPOINT_SITE_ID')
  }
  const origine = argSite ? '--site' : process.env.SP_SITE_RU ? 'SP_SITE_RU' : 'SHAREPOINT_SITE_ID'
  console.log(`→ Sito bersaglio (${origine}): ${site}`)

  console.log('→ Autenticazione Graph...')
  const token = await getToken()

  const env = {}
  for (const def of LISTE) {
    env[def.envKey] = await provisionList(token, site, def)
  }

  console.log('\n============================================================')
  console.log('Aggiungi queste righe a .env.local e alle Environment Variables su Vercel:\n')
  for (const [k, v] of Object.entries(env)) console.log(`  ${k}=${v}`)
  console.log('\n============================================================')
  console.log('Poi importa i dati:  node scripts/import-risorse-umane.mjs')
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
