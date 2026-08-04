#!/usr/bin/env node
/**
 * Confronta l'anagrafica Risorse Umane (SharePoint) con l'anagrafica delle
 * timbrature (Supabase) e, su richiesta, le allinea.
 *
 * Fa da terminale esattamente ciò che fa il pulsante "Sincronizza da anagrafica"
 * del Cruscotto Timbrature, con due vantaggi quando qualcosa non torna:
 *   - non richiede il permesso applicativo "Timbrature HR";
 *   - mostra riga per riga cosa c'è nei due mondi, quindi dice *perché* una
 *     persona non risulta abilitata invece di limitarsi a non abilitarla.
 *
 * Uso (da web/):
 *   node scripts/sync-timbrature-anagrafica.mjs                  # solo lettura
 *   node scripts/sync-timbrature-anagrafica.mjs --apply          # allinea
 *   node scripts/sync-timbrature-anagrafica.mjs --solo=maseri    # filtra per testo
 *
 * Legge GRAPH_*, SP_* e SUPABASE_* da .env.local. La service role key è la
 * stessa che usa l'app lato server: tenerla fuori dai log.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const APPLY = process.argv.includes('--apply')
const SOLO = (process.argv.find((a) => a.startsWith('--solo='))?.split('=')[1] || '').toLowerCase()

// --------------------------------------------------------------------- utilità

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* env già impostate */ }
}

const val = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

// ------------------------------------------------------------------- Graph (RU)

async function graphToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.GRAPH_CLIENT_ID,
        client_secret: process.env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  )
  const d = await res.json()
  if (!res.ok) throw new Error(d.error_description || 'token Graph non ottenuto')
  return d.access_token
}

async function graphAll(tk, url) {
  const out = []
  let next = `https://graph.microsoft.com/v1.0${url}`
  while (next) {
    const res = await fetch(next, {
      headers: {
        Authorization: `Bearer ${tk}`,
        Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
      },
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error?.message || `Graph ${res.status}`)
    out.push(...(d.value || []))
    next = d['@odata.nextLink'] || null
  }
  return out
}

// -------------------------------------------------------------------- Supabase

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

async function sb(metodo, path, body) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '')
  const res = await fetch(`${base}/rest/v1${path}`, {
    method: metodo,
    headers: sbHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const testo = await res.text()
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${testo.slice(0, 300)}`)
  return testo ? JSON.parse(testo) : null
}

// ------------------------------------------------------------------ abilitazione
// Stesse regole di lib/timbrature-sync.ts: se cambiano lì, cambiarle qui.

const CHIUSO_TIROCINIO = ['INTERROTTO', 'TERMINATO']

function leggiScheda(it) {
  const f = it.fields || {}
  const cognome = val(f.Cognome)
  const nome = val(f.Nome)
  const chiuso =
    val(f.StatoRapporto) === 'Cessato' ||
    CHIUSO_TIROCINIO.includes(val(f.StatoTirocinio).toUpperCase())
  return {
    nominativo: `${cognome} ${nome}`.trim() || val(f.Title) || `item ${it.id}`,
    email: val(f.MailAziendale).toLowerCase(),
    referente: val(f.ReferenteFoglioOre).toLowerCase() || null,
    spuntata: val(f.TimbraturaAttiva) === 'Si',
    statoRapporto: val(f.StatoRapporto) || val(f.StatoTirocinio) || '(vuoto)',
    chiuso,
    get attivo() { return this.spuntata && !this.chiuso },
  }
}

// ----------------------------------------------------------------------- main

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[k]) throw new Error(`Variabile mancante in .env.local: ${k}`)
  }
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  if (!site) throw new Error('Variabile mancante: SP_SITE_RU (o SHAREPOINT_SITE_ID)')

  console.log(APPLY ? '\n▶ MODALITÀ SCRITTURA (--apply)\n' : '\n▶ SOLO LETTURA — aggiungi --apply per allineare.\n')

  // --- lato SharePoint ------------------------------------------------------
  const tk = await graphToken()
  const campi = 'Title,Cognome,Nome,MailAziendale,ReferenteFoglioOre,TimbraturaAttiva,StatoRapporto,StatoTirocinio'
  const liste = [
    ['dipendenti', process.env.SP_LIST_DIPENDENTI],
    ['tirocini', process.env.SP_LIST_TIROCINI],
  ].filter(([, id]) => !!id)

  const schede = []
  for (const [etichetta, listId] of liste) {
    const items = await graphAll(
      tk,
      `/sites/${site}/lists/${listId}/items?$select=id,fields&$expand=fields($select=${campi})&$top=200`,
    )
    for (const it of items) schede.push({ entita: etichetta, ...leggiScheda(it) })
  }

  // --- lato Supabase --------------------------------------------------------
  const righeSb = await sb('GET', '/dipendente?select=id,email,cognome_nome,referente_email,attivo')
  const perEmail = new Map(righeSb.map((r) => [String(r.email).toLowerCase(), r]))

  console.log(`  schede in anagrafica RU ........ ${schede.length}`)
  console.log(`  righe in Supabase .............. ${righeSb.length}`)
  console.log(`  con spunta "Timbratura attiva" . ${schede.filter((s) => s.spuntata).length}`)
  console.log(`  di cui abilitabili ............. ${schede.filter((s) => s.attivo && s.email).length}`)

  // --- confronto ------------------------------------------------------------
  const interessanti = schede.filter((s) => {
    if (SOLO) return `${s.nominativo} ${s.email}`.toLowerCase().includes(SOLO)
    return s.spuntata || perEmail.has(s.email)
  })

  console.log(`\n${'NOMINATIVO'.padEnd(30)} ${'SPUNTA'.padEnd(7)} ${'RAPPORTO'.padEnd(12)} ${'ATTESO'.padEnd(8)} SUPABASE`)
  console.log('-'.repeat(96))
  const azioni = []
  for (const s of interessanti) {
    const riga = s.email ? perEmail.get(s.email) : null
    let stato
    if (!s.email) stato = '⚠ manca la mail aziendale'
    else if (!riga) stato = s.attivo ? '✗ RIGA ASSENTE → da creare' : '— assente (corretto)'
    else if (riga.attivo === s.attivo) stato = riga.attivo ? '✓ attivo' : '✓ non attivo'
    else stato = s.attivo ? '✗ presente ma NON attivo → da attivare' : '✗ attivo ma da disattivare'

    console.log(
      `${s.nominativo.slice(0, 29).padEnd(30)} ${(s.spuntata ? 'Si' : 'No').padEnd(7)} ${s.statoRapporto.slice(0, 11).padEnd(12)} ${(s.attivo ? 'attivo' : 'no').padEnd(8)} ${stato}`,
    )

    if (!s.email) continue
    const cambiaAttivo = !riga || riga.attivo !== s.attivo
    const cambiaAltro =
      riga && (riga.cognome_nome !== s.nominativo || (riga.referente_email ?? null) !== s.referente)
    if ((!riga && s.attivo) || cambiaAttivo || cambiaAltro) azioni.push({ s, riga })
  }

  if (!azioni.length) {
    console.log('\n▶ Anagrafiche già allineate: niente da fare.\n')
    return
  }

  console.log(`\n▶ ${azioni.length} riga/righe da allineare.`)
  if (!APPLY) {
    console.log('  Per procedere: node scripts/sync-timbrature-anagrafica.mjs --apply\n')
    return
  }

  // --- scrittura ------------------------------------------------------------
  let creati = 0, aggiornati = 0
  const errori = []
  for (const { s, riga } of azioni) {
    try {
      if (!riga) {
        if (!s.attivo) continue
        await sb('POST', '/dipendente', {
          email: s.email, cognome_nome: s.nominativo, referente_email: s.referente, attivo: true,
        })
        creati++
        console.log(`  + creato   ${s.nominativo} (${s.email})`)
      } else {
        await sb('PATCH', `/dipendente?id=eq.${riga.id}`, {
          cognome_nome: s.nominativo, referente_email: s.referente, attivo: s.attivo,
        })
        aggiornati++
        console.log(`  ~ aggiorn. ${s.nominativo} → ${s.attivo ? 'attivo' : 'non attivo'}`)
      }
    } catch (e) {
      errori.push(`${s.nominativo}: ${e.message}`)
    }
  }

  console.log(`\n▶ Creati ${creati}, aggiornati ${aggiornati}.`)
  if (errori.length) {
    console.log('\n=== Errori')
    for (const e of errori) console.log(`  · ${e}`)
  }
  console.log('\nRicorda il monte ore settimanale dal Cruscotto Timbrature → Controlla.\n')
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
