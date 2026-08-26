#!/usr/bin/env node
/**
 * Importa l'export TIM delle utenze mobili dentro l'area IT.
 *
 * Il foglio dell'operatore (`sim.xlsx`) porta quello che nelle liste dell'IT non
 * c'era: contratto, piano, data di attivazione, costo, e soprattutto **chi usa
 * ogni numero** — informazione che non era scritta da nessuna parte.
 *
 * Cosa fa, per ciascuna delle righe del foglio:
 *   1. trova la SIM in anagrafica **accoppiando per numero di telefono** (non per
 *      ICCID: nel foglio è troncato dell'ultima cifra di controllo);
 *   2. aggiorna piano, contratto, data di attivazione e costo — il foglio vince,
 *      è la fonte dell'operatore;
 *   3. chiude le assegnazioni attive e ne apre una nuova alla data del foglio,
 *      con la persona risolta dalla rubrica di Entra (nome + cognome) e il centro
 *      di costo accoppiato dal servizio (`it-sim-servizi.json`);
 *   4. ricopia sull'anagrafica chi ce l'ha e su quale centro di costo pesa.
 *
 * Le utenze che non sono di una persona — SPI.CO, la Serra, le comunità, la
 * Locanda — diventano assegnazioni **in condivisione**: senza assegnatario, come
 * il NAS e le stampanti.
 *
 * Prova a vuoto per default, scrive solo con `--applica`.
 *
 * Uso (dalla cartella web/):
 *   node scripts/import-sim-tim.mjs
 *   node scripts/import-sim-tim.mjs --applica
 *   node scripts/import-sim-tim.mjs --file=../sim.xlsx
 *
 * Richiede: GRAPH_*, SHAREPOINT_SITE_ID, SP_LIST_SIM, SP_LIST_ASSEGNAZIONI_SIM,
 * SP_LIST_CENTRI_COSTO. Permessi Graph: Sites.ReadWrite.All + User.Read.All.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import ExcelJS from 'exceljs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLICA = process.argv.includes('--applica')
const FILE = resolve(
  process.argv.find((a) => a.startsWith('--file='))?.slice(7) ?? join(__dirname, '..', '..', 'sim.xlsx'),
)
const DOMINIO = 'cooperativamirafiori.com'
const MAPPA = JSON.parse(readFileSync(join(__dirname, 'it-sim-servizi.json'), 'utf8'))

/** Il foglio non ha la colonna operatore: il contratto è uno solo, ed è TIM. */
const OPERATORE = 'TIM'
/**
 * Il foglio dà il *nome* del piano ("Ricaricabile Business"), non il tipo.
 * "Voce + Dati" è quello che l'anagrafica usa già: resta un'assunzione, e come
 * tale viene scritta soltanto dove il tipo manca.
 */
const TIPO_PIANO_SE_VUOTO = 'Voce + Dati'

// ============================================================
// Infrastruttura
// ============================================================

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* env già impostate */ }
}

let TOKEN = null
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

async function graph(method, path, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${method} ${path.slice(0, 80)} → ${res.status}: ${t.slice(0, 220)}`)
  return t ? JSON.parse(t) : {}
}

async function tutte(path) {
  const out = []
  let url = path
  while (url) {
    const p = await graph('GET', url)
    out.push(...(p.value || []))
    url = p['@odata.nextLink']?.replace('https://graph.microsoft.com/v1.0', '') ?? null
  }
  return out
}

// ============================================================
// Normalizzazioni
// ============================================================

const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

/** Numero in forma confrontabile: solo cifre, senza prefisso internazionale. */
function numeroChiave(v) {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.startsWith('39') && d.length > 10 ? d.slice(2) : d
}

function parole(nome) {
  return txt(nome)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
}
const chiaveNome = (nome) => parole(nome).join(' ')

/** Data del foglio → "2025-04-29". Accetta stringa gg/mm/aaaa o Date. */
function dataFoglio(v) {
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`
  }
  const s = txt(v)
  const it = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (it) return `${it[3]}-${it[2].padStart(2, '0')}-${it[1].padStart(2, '0')}`
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null
}

const spData = (ymd) => (ymd ? `${ymd}T12:00:00Z` : undefined)

// ============================================================
// Lettura del foglio
// ============================================================

/**
 * Le intestazioni del foglio TIM. Attenzione: la colonna "NOME" contiene il
 * cognome e "COGNOME" il nome — nell'export sono invertite, e si vede dai dati
 * ("CORDARO | LUCA"). Si legge per posizione dell'intestazione, non per indice
 * fisso, così un export con le colonne in ordine diverso continua a funzionare.
 */
const COLONNE = {
  servizio: ['servizio'],
  cognome: ['nome'],
  nome: ['cognome'],
  numero: ['numero telefono', 'numero'],
  iccid: ['iccid'],
  contratto: ['n. contratto', 'contratto'],
  stato: ['stato linea', 'stato'],
  piano: ['piano tariffario', 'piano'],
  attivazione: ['data attivazione', 'attivazione'],
}

async function leggiFoglio(percorso) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(percorso)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Il file non ha nessun foglio.')

  const intestazioni = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { intestazioni[i] = txt(c.value).toLowerCase() })
  const indice = {}
  for (const [campo, nomi] of Object.entries(COLONNE)) {
    const i = intestazioni.findIndex((h) => h && nomi.includes(h))
    if (i > 0) indice[campo] = i
  }
  for (const obbligatoria of ['numero', 'servizio']) {
    if (!indice[obbligatoria]) {
      throw new Error(`Colonna "${obbligatoria}" non trovata. Intestazioni lette: ${intestazioni.filter(Boolean).join(', ')}`)
    }
  }
  // Il costo è nell'ultima colonna, senza intestazione: si prende com'è.
  const colCosto = ws.columnCount

  const righe = []
  ws.eachRow((row, n) => {
    if (n === 1) return
    const cel = (campo) => (indice[campo] ? row.getCell(indice[campo]).value : null)
    const numero = numeroChiave(cel('numero'))
    if (!numero) return
    const costoRaw = row.getCell(colCosto).value
    righe.push({
      riga: n,
      servizio: txt(cel('servizio')),
      cognome: txt(cel('cognome')),
      nome: txt(cel('nome')),
      numero,
      numeroScritto: txt(cel('numero')),
      iccid: txt(cel('iccid')),
      contratto: txt(cel('contratto')),
      stato: txt(cel('stato')),
      piano: txt(cel('piano')),
      attivazione: dataFoglio(cel('attivazione')),
      costo: typeof costoRaw === 'number' ? costoRaw : Number(String(costoRaw ?? '').replace(',', '.')) || null,
    })
  })
  return righe
}

// ============================================================
// Programma
// ============================================================

async function main() {
  loadEnvLocal()
  for (const k of [
    'GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID',
    'SP_LIST_SIM', 'SP_LIST_ASSEGNAZIONI_SIM', 'SP_LIST_CENTRI_COSTO',
  ]) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const L_SIM = process.env.SP_LIST_SIM
  const L_ASG = process.env.SP_LIST_ASSEGNAZIONI_SIM

  console.log(APPLICA ? '── IMPORTAZIONE (scrive)' : '── PROVA A VUOTO (non scrive niente)')
  const foglio = await leggiFoglio(FILE)
  console.log(`Foglio: ${FILE}\n  ${foglio.length} righe`)

  TOKEN = await getToken()

  // --- anagrafiche -------------------------------------------------------
  const [simSP, asgSP, centriSP, utentiEntra] = await Promise.all([
    tutte(`/sites/${site}/lists/${L_SIM}/items?$expand=fields($select=Title,Numero,Operatore,TipoPiano,NomePiano,StatoSim,CostoMensile,RiferimentoContratto,DataAttivazione)&$top=200`),
    tutte(`/sites/${site}/lists/${L_ASG}/items?$expand=fields($select=SimLookupId,Stato,DataAssegnazione,AssegnatarioMail,IdListaIT)&$top=200`),
    tutte(`/sites/${site}/lists/${process.env.SP_LIST_CENTRI_COSTO}/items?$expand=fields($select=Title,Attivo)&$top=200`),
    tutte('/users?$select=displayName,mail,userPrincipalName&$top=999'),
  ])

  const simPerNumero = new Map(simSP.map((s) => [numeroChiave(s.fields?.Numero), s]))
  console.log(`Anagrafica SIM: ${simSP.length} · assegnazioni esistenti: ${asgSP.length} · centri di costo: ${centriSP.length}`)

  // --- centri di costo: nome → id ---------------------------------------
  const centroPerNome = new Map()
  for (const c of centriSP) {
    if (c.fields?.Attivo === false) continue
    centroPerNome.set(txt(c.fields?.Title).toLowerCase(), { id: Number(c.id), nome: txt(c.fields?.Title) })
  }
  const centroDaServizio = new Map()
  for (const [servizio, nomeCentro] of Object.entries(MAPPA.certi ?? {})) {
    const centro = centroPerNome.get(String(nomeCentro).toLowerCase())
    if (!centro) {
      throw new Error(
        `it-sim-servizi.json: il centro di costo "${nomeCentro}" (servizio "${servizio}") non esiste in anagrafica. ` +
          `Presenti: ${[...centroPerNome.values()].map((c) => c.nome).join(', ')}`,
      )
    }
    centroDaServizio.set(servizio.toLowerCase(), centro)
  }
  const centroPerRiga = new Map()
  for (const [numero, nomeCentro] of Object.entries(MAPPA.perRiga ?? {})) {
    if (numero === '_') continue
    const centro = centroPerNome.get(String(nomeCentro).toLowerCase())
    if (!centro) throw new Error(`it-sim-servizi.json: centro "${nomeCentro}" (numero ${numero}) inesistente.`)
    centroPerRiga.set(numeroChiave(numero), centro)
  }

  // --- persone: nome del foglio → indirizzo -------------------------------
  const perNome = new Map()
  for (const u of utentiEntra) {
    const mail = txt(u.mail || u.userPrincipalName).toLowerCase()
    if (!mail.endsWith(`@${DOMINIO}`)) continue
    const k = chiaveNome(u.displayName)
    if (!k) continue
    const gruppo = perNome.get(k) ?? []
    gruppo.push({ mail, nome: txt(u.displayName) })
    perNome.set(k, gruppo)
  }

  const nonDiPersona = new Set((MAPPA.utenzeNonDiPersona ?? []).map((s) => chiaveNome(s)))
  const perMail = new Map()
  for (const gruppo of perNome.values()) for (const p of gruppo) perMail.set(p.mail, p)

  /**
   * Eccezioni indicate a mano: chi usa il numero quando il nome del foglio non
   * porta all'account. `null` = deliberatamente senza persona.
   */
  const forzate = new Map()
  for (const [numero, valore] of Object.entries(MAPPA.personePerNumero ?? {})) {
    if (numero === '_') continue
    if (valore === null) {
      forzate.set(numeroChiave(numero), null)
      continue
    }
    const mail = String(valore).includes('@') ? String(valore).toLowerCase() : `${valore}@${DOMINIO}`.toLowerCase()
    // Se l'indirizzo non è in rubrica il nome si ricava dalla parte prima della @:
    // meglio "Luca Cordaro" di una casella vuota nell'elenco dell'app.
    const daMail = mail
      .split('@')[0]
      .split(/[._-]/)
      .filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join(' ')
    forzate.set(numeroChiave(numero), perMail.get(mail) ?? { mail, nome: daMail, inventata: true })
  }

  // --- passata sulle righe -----------------------------------------------
  const daFare = []
  const problemi = []
  const senzaCentro = []
  const senzaPersona = []

  for (const r of foglio) {
    const sim = simPerNumero.get(r.numero)
    if (!sim) {
      problemi.push(`riga ${r.riga}: il numero ${r.numeroScritto} non è in anagrafica`)
      continue
    }

    const etichettaFoglio = txt(`${r.cognome} ${r.nome}`)
    const condivisa = nonDiPersona.has(chiaveNome(etichettaFoglio)) || nonDiPersona.has(chiaveNome(r.cognome))
    let persona = null

    if (forzate.has(r.numero)) {
      // L'eccezione scritta a mano vince sul foglio: è lì proprio perché il
      // foglio sbaglia o non basta.
      persona = forzate.get(r.numero)
      if (persona?.inventata) {
        problemi.push(
          `riga ${r.riga}: ${persona.mail} non è fra gli account di Entra — la scrivo comunque, ` +
            'ma se l’indirizzo è sbagliato la persona non vedrà la SIM in "I miei strumenti"',
        )
      }
      if (persona === null) senzaPersona.push(`${r.numeroScritto} · "${etichettaFoglio}" · lasciata da assegnare`)
    } else if (!condivisa) {
      const candidati = perNome.get(chiaveNome(`${r.nome} ${r.cognome}`)) ?? []
      if (candidati.length === 1) persona = candidati[0]
      else if (candidati.length > 1) problemi.push(`riga ${r.riga}: "${etichettaFoglio}" corrisponde a più account (${candidati.map((c) => c.mail).join(', ')})`)
      else senzaPersona.push(`${r.numeroScritto} · "${etichettaFoglio}"`)
    }

    const centro = centroPerRiga.get(r.numero) ?? centroDaServizio.get(r.servizio.toLowerCase()) ?? null
    if (!centro) senzaCentro.push(`${r.numeroScritto} · servizio "${r.servizio}"`)

    daFare.push({ r, sim, persona, condivisa, centro, etichettaFoglio })
  }

  // --- riepilogo prima di scrivere ---------------------------------------
  console.log(`\n── Cosa cambia (${daFare.length} righe)`)
  for (const d of daFare) {
    const chi = d.condivisa ? 'in condivisione' : d.persona ? d.persona.mail : '⚠ persona non risolta'
    console.log(
      `  ${d.r.numeroScritto.padEnd(12)} ${chi.padEnd(40)} ` +
      `${(d.centro?.nome ?? '— centro di costo da decidere').padEnd(34)} ${d.r.servizio}`,
    )
  }

  if (problemi.length) {
    console.log(`\n⚠ Da guardare (${problemi.length}):`)
    for (const p of problemi) console.log(`   · ${p}`)
  }
  if (senzaPersona.length) {
    console.log(`\nNomi non trovati in rubrica (${senzaPersona.length}) — l’assegnazione nasce senza persona:`)
    for (const s of senzaPersona) console.log(`   · ${s}`)
  }
  if (senzaCentro.length) {
    console.log(`\nSenza centro di costo (${senzaCentro.length}) — da assegnare dall’app:`)
    for (const s of senzaCentro) console.log(`   · ${s}`)
  }

  if (!APPLICA) {
    console.log('\nProva a vuoto: non è stato scritto niente. Per scrivere davvero:')
    console.log('  node scripts/import-sim-tim.mjs --applica\n')
    return
  }

  // --- scrittura ---------------------------------------------------------
  console.log('\n── Scrivo')
  const attivePerSim = new Map()
  for (const a of asgSP) {
    if (txt(a.fields?.Stato) !== 'Attiva') continue
    const k = String(a.fields?.SimLookupId ?? '')
    attivePerSim.set(k, [...(attivePerSim.get(k) ?? []), a])
  }

  let anagrafiche = 0
  let chiuse = 0
  let aperte = 0

  for (const d of daFare) {
    const { r, sim, persona, centro } = d
    const f = sim.fields ?? {}

    // 1. anagrafica: il foglio vince, tranne dove il foglio non dice niente.
    await graph('PATCH', `/sites/${site}/lists/${L_SIM}/items/${sim.id}/fields`, {
      Operatore: txt(f.Operatore) || OPERATORE,
      TipoPiano: txt(f.TipoPiano) || TIPO_PIANO_SE_VUOTO,
      NomePiano: r.piano || txt(f.NomePiano),
      RiferimentoContratto: r.contratto || txt(f.RiferimentoContratto),
      DataAttivazione: spData(r.attivazione) ?? undefined,
      CostoMensile: r.costo ?? undefined,
      StatoSim: /attiv/i.test(r.stato) ? 'Attiva' : txt(f.StatoSim) || 'Attiva',
      AssegnatarioMail: persona?.mail ?? '',
      AssegnatarioNome: persona?.nome ?? '',
      CentroDiCostoLookupId: centro?.id ?? null,
    })
    anagrafiche++

    // 2. chiudi le attive: l'invariante è una sola assegnazione attiva.
    for (const a of attivePerSim.get(String(sim.id)) ?? []) {
      await graph('PATCH', `/sites/${site}/lists/${L_ASG}/items/${a.id}/fields`, {
        Stato: 'Chiusa',
        DataFine: spData(r.attivazione) ?? undefined,
        Note: 'Chiusa dall’importazione dell’export TIM del 29/04/2025.',
      })
      chiuse++
    }

    // 3. apri quella nuova
    await graph('POST', `/sites/${site}/lists/${L_ASG}/items`, {
      fields: {
        Title: `${r.numeroScritto} · ${r.attivazione ?? ''}`,
        SimLookupId: Number(sim.id),
        AssegnatarioMail: persona?.mail ?? '',
        AssegnatarioNome: persona?.nome ?? '',
        CentroDiCostoLookupId: centro?.id ?? undefined,
        ServizioLegacy: r.servizio,
        DataAssegnazione: spData(r.attivazione) ?? undefined,
        Stato: 'Attiva',
        // La nota conserva quello che diceva il foglio: serve quando l'utenza è
        // di un servizio, quando nessuno l'ha ancora presa in carico, e quando la
        // persona vera è un'altra rispetto a quella scritta da TIM.
        Note:
          d.condivisa || !persona || chiaveNome(d.etichettaFoglio) !== chiaveNome(persona.nome)
            ? `Dall’export TIM: "${d.etichettaFoglio}"`
            : '',
        IdListaIT: `TIM-${r.numero}`,
      },
    })
    aperte++
  }

  console.log('\n' + '='.repeat(64))
  console.log(`✓ ${anagrafiche} SIM aggiornate · ${chiuse} assegnazioni chiuse · ${aperte} aperte`)
  console.log('='.repeat(64) + '\n')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
