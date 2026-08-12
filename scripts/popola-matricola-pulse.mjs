#!/usr/bin/env node
/**
 * Scrive `MatricolaPulse` sulle schede Dipendenti, prendendola dai cedolini.
 *
 * La matricola a 10 cifre che PULSE vuole nel file di importazione presenze
 * (0257 + qualifica INPS + codice personale a 5 cifre) viene ricavata dalla riga
 * anagrafica del cedolino LUL, non dal campo `Matricola` che sta in anagrafica:
 * quello arriva dal vecchio Access e su qualche scheda ha la cifra di qualifica
 * vecchia o il codice personale trascritto male. Il perche' in dettaglio sta in
 * `diagnosi-matricole-pulse.mjs`.
 *
 * `Matricola` non viene toccata: resta il riferimento storico delle RU.
 *
 * PRIMA DI SCRIVERE, guardare cosa cambia:
 *   node scripts/diagnosi-matricole-pulse.mjs
 *
 * USO (dalla cartella web/):
 *   node scripts/popola-matricola-pulse.mjs                # prova a vuoto, non scrive
 *   node scripts/popola-matricola-pulse.mjs --conferma     # scrive davvero
 *   node scripts/popola-matricola-pulse.mjs --conferma --sovrascrivi
 *
 * Senza `--conferma` non tocca niente: elenca solo cosa scriverebbe.
 * Senza `--sovrascrivi` lascia stare le schede che hanno gia' un valore diverso,
 * perche' se qualcuno l'ha corretto a mano ha piu' informazioni di noi.
 *
 * La colonna deve esistere sulla lista:
 *   node scripts/aggiungi-colonna-ru.mjs MatricolaPulse testo
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SP_LIST_DIPENDENTI e il sito (SP_SITE_RU o SHAREPOINT_SITE_ID).
 * Permesso Graph: Sites.ReadWrite.All (Application).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFERMA = process.argv.includes('--conferma')
const SOVRASCRIVI = process.argv.includes('--sovrascrivi')

const iCed = process.argv.indexOf('--cedolini')
const FILE_CEDOLINI = iCed > -1 && process.argv[iCed + 1]
  ? process.argv[iCed + 1]
  : join(__dirname, 'ru-data', 'matricole-pulse.csv')

function caricaEnv() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const riga of raw.split('\n')) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* env gia' impostate */ }
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      client_secret: GRAPH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(`Token non ottenuto: ${d.error_description || res.status}`)
  return d.access_token
}

async function graph(token, url, opts = {}) {
  const res = await fetch(url.startsWith('http') ? url : `https://graph.microsoft.com/v1.0${url}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
      ...(opts.headers ?? {}),
    },
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${opts.method ?? 'GET'} ${url} → ${res.status}: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : {}
}

const val = (v) => (v == null ? '' : String(v).trim())

function leggiCedolini() {
  let raw
  try {
    // BOM e CRLF vanno via subito: altrimenti l'ultima colonna arriva con un \r
    // in coda e la matricola non passa il controllo delle dieci cifre.
    raw = readFileSync(FILE_CEDOLINI, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  } catch {
    console.error(`✗ CSV dei cedolini non trovato: ${FILE_CEDOLINI}`)
    console.error('  Generalo con: python3 scripts/estrai-matricole-cedolini.py "../cedolini luglio"')
    process.exit(1)
  }
  const righe = raw.split('\n').filter((r) => r.trim())
  const intest = righe.shift().split(';').map((c) => c.trim())
  const iCf = intest.indexOf('cf')
  const iPulse = intest.indexOf('matricola_pulse')
  const iDescr = intest.indexOf('descr')
  if (iCf < 0 || iPulse < 0) {
    console.error('✗ Il CSV dei cedolini non ha le colonne cf e matricola_pulse')
    process.exit(1)
  }
  const mappa = new Map()
  for (const r of righe) {
    const c = r.split(';')
    const cf = val(c[iCf]).toUpperCase()
    const pulse = val(c[iPulse])
    // Meglio saltare una riga malformata che scrivere una matricola sbagliata:
    // PULSE la accetterebbe e attribuirebbe le ore a un altro lavoratore.
    if (!cf || !/^\d{10}$/.test(pulse)) continue
    mappa.set(cf, { pulse, descr: val(c[iDescr]) })
  }
  return mappa
}

async function main() {
  caricaEnv()
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  const listId = process.env.SP_LIST_DIPENDENTI
  if (!site || !listId) {
    console.error('✗ Mancano SP_SITE_RU (o SHAREPOINT_SITE_ID) e SP_LIST_DIPENDENTI in .env.local')
    process.exit(1)
  }

  const cedolini = leggiCedolini()
  const token = await getToken()

  const items = []
  let url = `/sites/${site}/lists/${listId}/items?$select=id&$expand=fields($select=Cognome,Nome,CodiceFiscale,Matricola,MatricolaPulse)&$top=200`
  while (url) {
    const res = await graph(token, url)
    items.push(...(res.value || []))
    url = res['@odata.nextLink'] || null
  }

  const daScrivere = []; const daConfermare = []; const giaOk = []; const senzaCed = []

  for (const it of items) {
    const f = it.fields ?? {}
    const nome = `${val(f.Cognome)} ${val(f.Nome)}`.trim()
    const ced = cedolini.get(val(f.CodiceFiscale).toUpperCase())
    if (!ced) { senzaCed.push(nome); continue }
    const attuale = val(f.MatricolaPulse)
    if (attuale === ced.pulse) { giaOk.push(nome); continue }
    const riga = { id: it.id, nome, attuale, nuova: ced.pulse, descr: ced.descr }
    if (attuale && !SOVRASCRIVI) daConfermare.push(riga)
    else daScrivere.push(riga)
  }

  daScrivere.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  daConfermare.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))

  console.log(`Schede lette: ${items.length} · cedolini in tabella: ${cedolini.size}`)
  console.log(`Gia' corrette: ${giaOk.length} · da scrivere: ${daScrivere.length} · senza cedolino: ${senzaCed.length}\n`)

  for (const r of daScrivere) {
    const da = r.attuale ? `${r.attuale} → ` : ''
    console.log(`  · ${r.nome.padEnd(32)} ${da}${r.nuova}  (${r.descr})`)
  }

  if (daConfermare.length) {
    console.log(`\nHanno gia' un valore diverso, lasciate stare (${daConfermare.length}).`)
    console.log('Se vanno riallineate al cedolino: aggiungere --sovrascrivi')
    for (const r of daConfermare) {
      console.log(`  · ${r.nome.padEnd(32)} in lista ${r.attuale} · cedolino ${r.nuova}`)
    }
  }

  if (senzaCed.length) {
    console.log(`\nSenza cedolino nel mese estratto, non toccate (${senzaCed.length}):`)
    console.log('  ' + senzaCed.sort((a, b) => a.localeCompare(b, 'it')).join(', '))
  }

  if (!CONFERMA) {
    console.log(`\nProva a vuoto: non ho scritto niente. Per scrivere le ${daScrivere.length} matricole:`)
    console.log('  node scripts/popola-matricola-pulse.mjs --conferma')
    return
  }

  if (!daScrivere.length) {
    console.log('\nNiente da scrivere.')
    return
  }

  console.log('')
  let fatte = 0
  for (const r of daScrivere) {
    try {
      await graph(token, `/sites/${site}/lists/${listId}/items/${r.id}/fields`, {
        method: 'PATCH',
        body: JSON.stringify({ MatricolaPulse: r.nuova }),
      })
      fatte++
    } catch (e) {
      console.error(`  ✗ ${r.nome}: ${e.message}`)
    }
  }
  console.log(`✓ Scritte ${fatte} matricole su ${daScrivere.length}.`)
  if (fatte < daScrivere.length) {
    console.log('  Se l\'errore parla di campo inesistente, manca la colonna sulla lista:')
    console.log('  node scripts/aggiungi-colonna-ru.mjs MatricolaPulse testo')
  }
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
