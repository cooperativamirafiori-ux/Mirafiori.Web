#!/usr/bin/env node
/**
 * Import dati "Cedolini" (export payroll / Libro Unico del Lavoro) nella
 * Lista SharePoint Dipendenti, con Excel come fonte di verità in caso di
 * discrepanza.
 *
 * USO (dalla cartella web/):
 *   node scripts/import-cedolini-dipendenti.mjs <percorso.xlsx>            # 1) SOLO verifica compatibilità (nessuna rete, nessuna scrittura)
 *   node scripts/import-cedolini-dipendenti.mjs <percorso.xlsx> --diff     # 2) legge anche la lista SharePoint e mostra le differenze riga per riga (nessuna scrittura)
 *   node scripts/import-cedolini-dipendenti.mjs <percorso.xlsx> --apply    # 3) applica gli aggiornamenti (PATCH) sui record già esistenti
 *
 * Legge il foglio "Dipendenti e Soci" del file Excel dei cedolini.
 * (Il foglio "Parasubordinati e Terzi" NON viene toccato: sono collaboratori,
 * non dipendenti — semmai va gestito a parte sulla lista Collaboratori.)
 *
 * REGOLE:
 * - Il confronto/aggiornamento avviene per Matricola (fallback: Codice Fiscale
 *   se la Matricola manca su uno dei due lati).
 * - Vengono scritti SOLO i campi elencati in MAPPING con enabled=true.
 * - Per default, se la cella Excel è vuota il campo SharePoint corrispondente
 *   NON viene toccato (si presume "Excel non ha l'informazione", non "cancella
 *   il dato"). Fa eccezione DataScadenzaContratto, dove sia il vuoto sia il
 *   valore sentinella 00/00/0000 significano esplicitamente "nessuna scadenza"
 *   e quindi vengono scritti come null (Excel è definitivo su questo campo).
 * - Righe Excel senza corrispondenza nella lista NON vengono create (solo
 *   segnalate): questo script AGGIORNA, non crea nuovi dipendenti.
 * - Record della lista senza corrispondenza in Excel NON vengono toccati
 *   (solo segnalati): potrebbero essere cessati, in altra fonte, ecc.
 *
 * Campi volutamente ESCLUSI (enabled:false) perché il valore Excel non è
 * mappabile 1:1 sul valore choice SharePoint senza una decisione umana:
 *   - Mansione (da "Profilo Professionale", testo libero non normalizzato:
 *     vedi cedolini-mansione-map.json, editabile)
 *   - TipoContratto (da "Tempo" + "Scadenza Contratto": il file dice
 *     pieno/parziale ma non determinato/indeterminato)
 *   - Socio / ServizioAppartenenza / InvalidoSvantaggiato (da "Reparto",
 *     campo composito: es. "SOCI LOCANDA", "SOCI SVANTAGGIATI")
 *   - Nazionalita (da "Nazione", codice ISO3 sparso, non chiaro se il vuoto
 *     significhi "italiano" o "non rilevato")
 * Per abilitarli: leggi la nota nel MAPPING corrispondente e imposta enabled:true.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ExcelJS from 'exceljs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHEET_NAME = 'Dipendenti e Soci'
const MANSIONE_MAP_PATH = join(__dirname, 'cedolini-mansione-map.json')

// ------------------------------------------------------------------
// Scelte valide dei campi choice coinvolti (devono restare identiche
// a web/types/risorse-umane.ts: se cambi lo schema, aggiorna anche qui).
// ------------------------------------------------------------------
const LIVELLO_VALIDI = new Set(['A1', 'A2', 'B1', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3', 'E1', 'E2', 'F1', 'F2'])
const MANSIONE_VALIDE = new Set([
  'ADEST', 'Assistente Sociale', 'Assistente alla persona', 'Addetto alle pulizie',
  'Addetto alla sala', 'Addetto mensa', 'Addetto manutenzione aree verdi', 'Aiuto cuoco',
  'Aiuto Bibliotecaria', 'Animatore', 'Autista', 'Barista', 'Bibliotecario', 'Cuoco',
  'Coordinatore AS', 'Cameriere', 'Dirigente quadro', 'Educatore', 'Educatore Coordinatore',
  'Educatore quadro', 'Educatore prima infanzia', 'Grafico', 'Guida Museale', 'Infermiere',
  'Impiegato', 'Lava piatti', 'Logopedista', 'Maestra', 'Mediatore culturale',
  "Operatore dell'inserimento lavorativo", 'OSS', 'Pizzaiolo', 'Psicologo', 'Sociologo',
  'Supervisore', 'Segretario', 'Tirocinante',
])

// ------------------------------------------------------------------
// Util
// ------------------------------------------------------------------
function s(v) {
  if (v == null) return ''
  return String(v).trim()
}

/** "dd/mm/yyyy" -> "yyyy-mm-dd" | null. Tratta 00/00/0000 e vuoto come null. */
function parseDataIt(v) {
  const t = s(v)
  if (!t || t === '00/00/0000') return null
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, gg, mm, yyyy] = m
  return `${yyyy}-${mm}-${gg}`
}

/** "30,00" -> 30 | null */
function parseNumeroIt(v) {
  const t = s(v)
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function isCF(v) {
  return /^[A-Z0-9]{16}$/i.test(s(v))
}

// ------------------------------------------------------------------
// MAPPING: colonna Excel -> campo SharePoint
// ------------------------------------------------------------------
const mansioneMap = existsSync(MANSIONE_MAP_PATH)
  ? JSON.parse(readFileSync(MANSIONE_MAP_PATH, 'utf8'))
  : {}

const MAPPING = [
  // --- chiave di match (sempre letta, non scritta come "diff" a sé) ---
  { excel: 'Matricola', sp: 'Matricola', enabled: true, transform: (r) => s(r['Matricola']) || null },

  // --- anagrafica: diretti/sicuri ---
  { excel: 'Cognome', sp: 'Cognome', enabled: true, transform: (r) => s(r['Cognome']) || null },
  { excel: 'Nome', sp: 'Nome', enabled: true, transform: (r) => s(r['Nome']) || null },
  {
    excel: 'Sesso', sp: 'Genere', enabled: true,
    transform: (r) => ({ M: 'Maschio', F: 'Femmina' }[s(r['Sesso']).toUpperCase()] ?? null),
  },
  { excel: 'Codice Fiscale', sp: 'CodiceFiscale', enabled: true, transform: (r) => s(r['Codice Fiscale']).toUpperCase() || null },
  { excel: 'Data Nascita', sp: 'DataNascita', enabled: true, transform: (r) => parseDataIt(r['Data Nascita']) },

  // --- costruiti da più colonne ---
  {
    excel: 'Comune Nascita + Provincia Nascita', sp: 'LuogoNascita', enabled: true,
    transform: (r) => {
      const comune = s(r['Comune Nascita'])
      const pr = s(r['Provincia Nascita'])
      if (!comune) return null
      return pr ? `${comune} (${pr})` : comune
    },
  },
  {
    excel: 'Indirizzo + Comune + Pr + Cap', sp: 'Residenza', enabled: true,
    transform: (r) => {
      const ind = s(r['Indirizzo'])
      const comune = s(r['Comune'])
      const pr = s(r['Pr'])
      const cap = s(r['Cap'])
      if (!ind && !comune) return null
      const parte2 = [cap, comune].filter(Boolean).join(' ') + (pr ? ` (${pr})` : '')
      return [ind, parte2].filter(Boolean).join(', ')
    },
  },

  // --- rapporto di lavoro: diretti/sicuri ---
  { excel: 'Assunzione', sp: 'DataAssunzione', enabled: true, transform: (r) => parseDataIt(r['Assunzione']) },
  {
    excel: 'Scadenza Contratto', sp: 'DataScadenzaContratto', enabled: true, clearIfBlank: true,
    transform: (r) => parseDataIt(r['Scadenza Contratto']),
  },
  {
    excel: 'Ore Settimanali (PT)', sp: 'OreLavoroPreviste', enabled: true,
    transform: (r) => parseNumeroIt(r['Ore Settimanali (PT)']),
  },
  {
    excel: 'Livello CCNL', sp: 'LivelloContrattuale', enabled: true,
    transform: (r) => {
      const v = s(r['Livello CCNL']).toUpperCase()
      return LIVELLO_VALIDI.has(v) ? v : null // es. 'TIR' non è un livello CCNL valido: ignorato
    },
  },

  // ================================================================
  // DISABILITATI DI DEFAULT — richiedono una decisione (vedi commento
  // in testa al file). Metti enabled:true dopo aver verificato la logica.
  // ================================================================
  {
    // Deciso con Dennis: abilitato, con il dizionario cedolini-mansione-map.json.
    // 4 valori (SOCIO OPERAIO, QUADRO, APPRENDISTA, SOCIA) non hanno match: righe non toccate.
    excel: 'Profilo Professionale', sp: 'Mansione', enabled: true,
    note: "Testo libero non normalizzato (61 varianti). Mappa in cedolini-mansione-map.json (editabile).",
    transform: (r) => {
      const v = s(r['Profilo Professionale']).toUpperCase()
      const mapped = mansioneMap[v]
      return mapped && MANSIONE_VALIDE.has(mapped) ? mapped : null
    },
  },
  {
    // Deciso con Dennis: abilitato con l'euristica Scadenza Contratto -> Determinato/Indeterminato.
    excel: 'Tempo + Scadenza Contratto', sp: 'TipoContratto', enabled: true,
    note: "Il file dice solo pieno/parziale, non determinato/indeterminato: dedotto da Scadenza Contratto.",
    transform: (r) => {
      const pieno = s(r['Tempo']).toUpperCase() === 'FULL TIME'
      const determinato = parseDataIt(r['Scadenza Contratto']) != null
      if (determinato) return pieno ? 'Determinato Tempo Pieno' : 'Determinato Tempo Parziale'
      return pieno ? 'Indeterminato Tempo Pieno' : 'Indeterminato Tempo Parziale'
    },
  },
  {
    // Deciso con Dennis: abilitato solo per VERIFICARE la congruenza con la lista
    // (se Excel dice "SOCI..." controlla/allinea che Socio=Si nella lista).
    excel: 'Reparto', sp: 'Socio', enabled: true,
    note: "'Si' se Reparto inizia per SOCI, altrimenti 'No'. Usato per verificare/allineare la coerenza con la lista.",
    transform: (r) => (s(r['Reparto']).toUpperCase().startsWith('SOCI') ? 'Si' : 'No'),
  },
  {
    // Deciso con Dennis: "lascia perdere" — resta disabilitato definitivamente.
    excel: 'Reparto', sp: 'ServizioAppartenenza', enabled: false,
    note: "Scartato: Dennis ha scelto di non derivarlo da Reparto (informazione insufficiente per 'DIPENDENTI'/'SOCI' generico).",
    transform: () => null,
  },
  {
    // Deciso con Dennis: abilitato solo per VERIFICARE la congruenza (non forza 'No' quando Reparto non lo menziona).
    excel: 'Reparto', sp: 'InvalidoSvantaggiato', enabled: true,
    note: "'Si' se Reparto contiene SVANTAGGIAT(O/I); per gli altri non scrive nulla (non implica 'No'). Usato per verificare/allineare.",
    transform: (r) => (s(r['Reparto']).toUpperCase().includes('SVANTAGGIAT') ? 'Si' : null),
  },
  {
    excel: 'Nazione', sp: 'Nazionalita', enabled: false,
    note: "Codice ISO3 presente solo per 9 righe su 122; per le altre non è chiaro se il vuoto significhi 'italiano' o 'non rilevato'. Aggiungi qui la tabella codice->nome se vuoi abilitarlo.",
    transform: () => null,
  },
]

// Colonne Excel senza alcun campo SharePoint corrispondente (solo referenziali
// al gestionale paghe): riportate nel check, mai scritte.
const EXCEL_SENZA_SP = ['Descrizione', 'Posizione', '% Part-Time', 'Codice CCNL', 'Pagina PDF']

// ------------------------------------------------------------------
// Lettura Excel
// ------------------------------------------------------------------
async function leggiExcel(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.getWorksheet(SHEET_NAME)
  if (!ws) throw new Error(`Foglio "${SHEET_NAME}" non trovato nel file (fogli presenti: ${wb.worksheets.map((w) => w.name).join(', ')})`)

  const headerRow = ws.getRow(1)
  const headers = []
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => { headers[col] = s(cell.text) })

  const righe = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const rec = {}
    headers.forEach((h, col) => { if (h) rec[h] = row.getCell(col).text })
    // scarta righe vuote / righe-nota (es. "Nota: dati estratti automaticamente...")
    const matricola = s(rec['Matricola'])
    const cf = s(rec['Codice Fiscale'])
    if (!matricola && !isCF(cf)) return
    rec.__riga = rowNumber
    righe.push(rec)
  })
  return righe
}

// ------------------------------------------------------------------
// Check di compatibilità (nessuna rete)
// ------------------------------------------------------------------
function stampaCompatibilita(righe) {
  console.log(`\n=== VERIFICA COMPATIBILITÀ CAMPI (${righe.length} righe dati nel foglio "${SHEET_NAME}") ===\n`)

  console.log('Campi mappati e SCRITTI (attivi):')
  for (const m of MAPPING.filter((x) => x.enabled && x.sp !== 'Matricola')) {
    console.log(`  ✓ "${m.excel}"  ->  ${m.sp}`)
  }

  console.log('\nCampi mappati ma DISABILITATI (richiedono una decisione — vedi note):')
  for (const m of MAPPING.filter((x) => !x.enabled)) {
    console.log(`  ⚠ "${m.excel}"  ->  ${m.sp}`)
    console.log(`     ${m.note}`)
  }

  console.log('\nColonne Excel senza campo SharePoint corrispondente (mai scritte):')
  console.log('  ' + EXCEL_SENZA_SP.join(', '))

  // Statistiche di validazione sui dati
  const senzaMatricola = righe.filter((r) => !s(r['Matricola'])).length
  const cfNonValidi = righe.filter((r) => !isCF(r['Codice Fiscale'])).length
  const matricole = righe.map((r) => s(r['Matricola'])).filter(Boolean)
  const dup = matricole.filter((m, i) => matricole.indexOf(m) !== i)
  const livelliNonValidi = righe.filter((r) => {
    const v = s(r['Livello CCNL']).toUpperCase()
    return v && !LIVELLO_VALIDI.has(v)
  })

  console.log('\nQualità dati Excel:')
  console.log(`  Righe senza Matricola: ${senzaMatricola}${senzaMatricola ? ' (verrà usato il Codice Fiscale come chiave)' : ''}`)
  console.log(`  Righe con Codice Fiscale non valido/mancante: ${cfNonValidi}`)
  console.log(`  Matricole duplicate: ${dup.length ? [...new Set(dup)].join(', ') : 'nessuna'}`)
  console.log(`  Righe con "Livello CCNL" fuori dai valori SharePoint validi (es. 'TIR'): ${livelliNonValidi.length} — LivelloContrattuale non verrà scritto per queste righe`)

  if (MAPPING.find((m) => m.excel === 'Profilo Professionale')) {
    const valori = [...new Set(righe.map((r) => s(r['Profilo Professionale']).toUpperCase()).filter(Boolean))]
    const senzaMatch = valori.filter((v) => !mansioneMap[v])
    console.log(`\n  "Profilo Professionale": ${valori.length} valori distinti, ${senzaMatch.length} senza corrispondenza in cedolini-mansione-map.json`)
    if (senzaMatch.length) console.log(`    Da completare: ${senzaMatch.join(' | ')}`)
  }
}

// ------------------------------------------------------------------
// Graph (solo per --diff / --apply)
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
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${t}`)
  return t ? JSON.parse(t) : {}
}

async function leggiListaDipendenti(token, site, listId) {
  const campi = ['Matricola', 'CodiceFiscale', ...MAPPING.map((m) => m.sp)].filter((v, i, a) => a.indexOf(v) === i)
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=${campi.join(',')})&$top=500`
  const out = []
  while (url) {
    const res = await graph(token, 'GET', url)
    for (const it of res.value || []) out.push({ id: it.id, fields: it.fields || {} })
    url = res['@odata.nextLink'] ? res['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null
  }
  return out
}

/** yyyy-mm-dd (o null) confrontato con il valore SP (che ha T12:00:00Z) */
function dataUguale(nuova, spValue) {
  const spGiorno = spValue ? String(spValue).slice(0, 10) : null
  return (nuova || null) === (spGiorno || null)
}

function valoreUguale(campo, nuovo, vecchio) {
  if (campo.endsWith('Data') || campo.startsWith('Data')) return dataUguale(nuovo, vecchio)
  if (nuovo == null && (vecchio == null || vecchio === '')) return true
  if (typeof nuovo === 'number') return Number(vecchio) === nuovo
  return s(nuovo) === s(vecchio ?? '')
}

/** Calcola i campi da scrivere per una riga Excel rispetto al record SP esistente. */
function calcolaDiff(riga, spFields) {
  const daScrivere = {}
  const diffLeggibili = []
  for (const m of MAPPING) {
    if (!m.enabled || m.sp === 'Matricola') continue
    const nuovo = m.transform(riga)
    const vecchio = spFields[m.sp]
    if (nuovo == null && !m.clearIfBlank) continue // Excel non ha l'informazione: non tocca il campo
    if (valoreUguale(m.sp, nuovo, vecchio)) continue
    daScrivere[m.sp] = m.sp.startsWith('Data') ? (nuovo ? `${nuovo}T12:00:00Z` : null) : nuovo
    diffLeggibili.push(`${m.sp}: "${vecchio ?? ''}" -> "${nuovo ?? ''}"`)
  }
  return { daScrivere, diffLeggibili }
}

// ------------------------------------------------------------------
// main
// ------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2)
  const xlsxPath = args.find((a) => !a.startsWith('--'))
  const modalitaDiff = args.includes('--diff')
  const modalitaApply = args.includes('--apply')
  if (!xlsxPath) throw new Error('Uso: node scripts/import-cedolini-dipendenti.mjs <percorso.xlsx> [--diff|--apply]')
  if (!existsSync(xlsxPath)) throw new Error(`File non trovato: ${xlsxPath}`)

  const righe = await leggiExcel(xlsxPath)
  stampaCompatibilita(righe)

  if (!modalitaDiff && !modalitaApply) {
    console.log('\n(Solo verifica compatibilità. Aggiungi --diff per confrontare con la lista SharePoint, --apply per scrivere.)')
    return
  }

  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_DIPENDENTI']) {
    if (!process.env[k]) throw new Error(`Variabile mancante in .env.local: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const listId = process.env.SP_LIST_DIPENDENTI

  console.log('\n→ Autenticazione Graph e lettura Lista Dipendenti...')
  const token = await getToken()
  const spItems = await leggiListaDipendenti(token, site, listId)
  console.log(`  ${spItems.length} record letti dalla lista SharePoint.`)

  const perMatricola = new Map()
  const perCF = new Map()
  for (const it of spItems) {
    const mat = s(it.fields.Matricola)
    const cf = s(it.fields.CodiceFiscale).toUpperCase()
    if (mat) perMatricola.set(mat, it)
    if (cf) perCF.set(cf, it)
  }

  let aggiornabili = 0, invariati = 0, senzaMatch = 0
  const daAggiornare = []
  for (const riga of righe) {
    const mat = s(riga['Matricola'])
    const cf = s(riga['Codice Fiscale']).toUpperCase()
    const match = (mat && perMatricola.get(mat)) || (cf && perCF.get(cf))
    if (!match) { senzaMatch++; continue }
    const { daScrivere, diffLeggibili } = calcolaDiff(riga, match.fields)
    if (diffLeggibili.length === 0) { invariati++; continue }
    aggiornabili++
    daAggiornare.push({ riga, match, daScrivere, diffLeggibili })
  }

  const matricoleExcel = new Set(righe.map((r) => s(r['Matricola'])).filter(Boolean))
  const cfExcel = new Set(righe.map((r) => s(r['Codice Fiscale']).toUpperCase()).filter(Boolean))
  const soloInSP = spItems.filter((it) => {
    const mat = s(it.fields.Matricola)
    const cf = s(it.fields.CodiceFiscale).toUpperCase()
    return !(mat && matricoleExcel.has(mat)) && !(cf && cfExcel.has(cf))
  })

  console.log(`\n=== CONFRONTO CON LA LISTA SHAREPOINT ===`)
  console.log(`  Righe Excel già allineate alla lista: ${invariati}`)
  console.log(`  Righe Excel con differenze da applicare: ${aggiornabili}`)
  console.log(`  Righe Excel senza corrispondenza nella lista (NON create automaticamente): ${senzaMatch}`)
  console.log(`  Record nella lista senza corrispondenza in Excel (NON toccati): ${soloInSP.length}`)

  if (daAggiornare.length) {
    console.log('\nDettaglio differenze:')
    for (const d of daAggiornare) {
      console.log(`  • ${s(d.riga['Cognome'])} ${s(d.riga['Nome'])} (Matricola ${s(d.riga['Matricola'])}):`)
      for (const line of d.diffLeggibili) console.log(`      ${line}`)
    }
  }

  if (!modalitaApply) {
    console.log('\n(Modalità --diff: nessuna scrittura eseguita. Rilancia con --apply per applicare questi aggiornamenti.)')
    return
  }

  console.log('\n→ Applico gli aggiornamenti su SharePoint...')
  let ok = 0, errori = 0
  for (const d of daAggiornare) {
    try {
      await graph(token, 'PATCH', `/sites/${site}/lists/${listId}/items/${d.match.id}/fields`, d.daScrivere)
      ok++
      console.log(`  ✓ ${s(d.riga['Cognome'])} ${s(d.riga['Nome'])}`)
    } catch (e) {
      errori++
      console.error(`  ✗ ${s(d.riga['Cognome'])} ${s(d.riga['Nome'])}: ${e.message.slice(0, 200)}`)
    }
  }
  console.log(`\n✓ Import completato: ${ok} aggiornati, ${errori} errori, ${senzaMatch} righe Excel senza match (non create), ${soloInSP.length} record SP non toccati.`)
}

main().catch((err) => { console.error('\n✗ ERRORE:', err.message); process.exit(1) })
