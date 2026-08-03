#!/usr/bin/env node
/**
 * Completa la MAIL AZIENDALE in anagrafica per i dipendenti ancora in forza che
 * ne sono privi, prendendo l'indirizzo VERO dal loro account Microsoft 365.
 *
 * Perché non generarlo e basta: la mail aziendale non è un dato descrittivo, è
 * la chiave con cui l'app riconosce la persona (è l'account con cui fa login).
 * Un indirizzo inventato che non corrisponde a nessuna casella lascerebbe la
 * persona bloccata senza che nessuno possa accorgersene. Quindi lo script cerca
 * l'account reale e, se non lo trova, si limita a segnalarlo.
 *
 * Il formato atteso `nome.cognome@dominio` viene usato solo come uno dei criteri
 * di ricerca fra gli account esistenti (nomi e cognomi composti attaccati:
 * "Maria Rosa De Luca" → mariarosa.deluca).
 *
 * Chi tocca: SOLO la lista Dipendenti (non Tirocini), solo le schede con
 * MailAziendale vuota e StatoRapporto diverso da "Cessato" (lo stato vuoto conta
 * come in forza, com'è già nell'elenco RU).
 *
 * Uso (da web/):
 *   node scripts/completa-mail-aziendali.mjs             # anteprima, NON scrive
 *   node scripts/completa-mail-aziendali.mjs --apply     # scrive in anagrafica
 *   node scripts/completa-mail-aziendali.mjs --dominio=altrodominio.it
 *
 * Dopo l'esecuzione: Cruscotto Timbrature → "Sincronizza da anagrafica".
 *
 * Permessi Graph richiesti (Application): Sites.ReadWrite.All, User.Read.All.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const APPLY = process.argv.includes('--apply')
const DOMINIO = (process.argv.find((a) => a.startsWith('--dominio='))?.split('=')[1] || 'cooperativamirafiori.com').toLowerCase()

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

/**
 * Riduce un nome a lettere e cifre: minuscolo, senza accenti, senza apostrofi,
 * spazi o punti. "D'Angelo" → dangelo, "Maria Rosa" → mariarosa.
 */
function slug(s) {
  return val(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Insieme delle parole di un nome, normalizzate: per confrontare i displayName. */
function paroleSlug(s) {
  return val(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

const stessoInsieme = (a, b) =>
  a.length > 0 && a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')

async function token() {
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
  if (!res.ok) throw new Error(d.error_description || 'token non ottenuto')
  return d.access_token
}

/** GET su Graph seguendo la paginazione (@odata.nextLink). */
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

async function graphPatch(tk, url, body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.error?.message || `Graph ${res.status}`)
  }
  return res.json()
}

// ------------------------------------------------------------------ ricerca M365

/**
 * Cerca l'account Microsoft 365 di una persona con tre criteri, dal più
 * affidabile al più tollerante. Restituisce l'elenco dei candidati: se non è
 * esattamente uno la decisione resta a una persona, non allo script.
 */
function candidatiPer(cognome, nome, utenti) {
  const sC = slug(cognome)
  const sN = slug(nome)
  if (!sC || !sN) return []

  // 1. cognome e nome dell'account combaciano
  const perCampi = utenti.filter((u) => slug(u.surname) === sC && slug(u.givenName) === sN)
  if (perCampi.length) return perCampi

  // 2. la parte prima della @ è esattamente nome.cognome
  const attesa = `${sN}.${sC}`
  const perIndirizzo = utenti.filter((u) => u.localPart === attesa)
  if (perIndirizzo.length) return perIndirizzo

  // 3. il nome visualizzato contiene le stesse parole, in qualunque ordine
  const parole = [...paroleSlug(cognome), ...paroleSlug(nome)]
  return utenti.filter((u) => stessoInsieme(parole, paroleSlug(u.displayName)))
}

// ----------------------------------------------------------------------- main

async function main() {
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID
  const listId = process.env.SP_LIST_DIPENDENTI
  if (!site) throw new Error('Variabile mancante: SP_SITE_RU (o SHAREPOINT_SITE_ID)')
  if (!listId) throw new Error('Variabile mancante: SP_LIST_DIPENDENTI')

  console.log(APPLY ? '\n▶ MODALITÀ SCRITTURA (--apply)\n' : '\n▶ ANTEPRIMA — nessuna modifica verrà scritta. Aggiungi --apply per procedere.\n')
  console.log(`  dominio atteso: @${DOMINIO}`)

  const tk = await token()

  // --- schede da completare -------------------------------------------------
  const campi = 'Title,Cognome,Nome,MailAziendale,MailPersonale,StatoRapporto,CategoriaRU'
  const items = await graphAll(
    tk,
    `/sites/${site}/lists/${listId}/items?$select=id,fields&$expand=fields($select=${campi})&$top=200`,
  )

  const daCompletare = []
  let conMail = 0
  let cessati = 0
  for (const it of items) {
    const f = it.fields || {}
    if (val(f.MailAziendale)) { conMail++; continue }
    // "in forza" = tutto tranne Cessato; lo stato vuoto conta come in forza.
    if (val(f.StatoRapporto) === 'Cessato') { cessati++; continue }
    daCompletare.push({
      itemId: it.id,
      cognome: val(f.Cognome),
      nome: val(f.Nome),
      nominativo: `${val(f.Cognome)} ${val(f.Nome)}`.trim() || val(f.Title) || `item ${it.id}`,
      personale: val(f.MailPersonale),
      categoria: val(f.CategoriaRU),
    })
  }

  console.log(`\n  schede totali .................. ${items.length}`)
  console.log(`  già con mail aziendale ......... ${conMail}`)
  console.log(`  senza mail ma cessati (saltati)  ${cessati}`)
  console.log(`  DA COMPLETARE .................. ${daCompletare.length}`)

  if (!daCompletare.length) {
    console.log('\nNiente da fare: tutti i dipendenti in forza hanno la mail aziendale.\n')
    return
  }

  // --- utenti Microsoft 365 -------------------------------------------------
  const grezzi = await graphAll(
    tk,
    '/users?$select=id,displayName,givenName,surname,mail,userPrincipalName,accountEnabled&$top=999',
  )
  const utenti = grezzi
    .filter((u) => u.accountEnabled !== false)
    .map((u) => {
      const indirizzo = (val(u.mail) || val(u.userPrincipalName)).toLowerCase()
      return { ...u, indirizzo, localPart: indirizzo.split('@')[0] || '' }
    })
    .filter((u) => u.indirizzo.endsWith(`@${DOMINIO}`))

  console.log(`  account M365 su @${DOMINIO} ...... ${utenti.length}`)

  // --- abbinamento ----------------------------------------------------------
  const daScrivere = []
  const ambigui = []
  const nonTrovati = []
  const giaPresa = new Map() // indirizzo → nominativo, per intercettare i doppioni

  for (const p of daCompletare) {
    const cand = candidatiPer(p.cognome, p.nome, utenti)
    if (cand.length === 1) {
      const ind = cand[0].indirizzo
      if (giaPresa.has(ind)) {
        ambigui.push({ ...p, motivo: `indirizzo ${ind} già assegnato a ${giaPresa.get(ind)}` })
        continue
      }
      giaPresa.set(ind, p.nominativo)
      daScrivere.push({ ...p, indirizzo: ind, atteso: `${slug(p.nome)}.${slug(p.cognome)}@${DOMINIO}` })
    } else if (cand.length > 1) {
      ambigui.push({ ...p, motivo: `${cand.length} account possibili: ${cand.map((c) => c.indirizzo).join(', ')}` })
    } else {
      nonTrovati.push(p)
    }
  }

  // --- resoconto ------------------------------------------------------------
  if (daScrivere.length) {
    console.log(`\n=== Da scrivere (${daScrivere.length})`)
    for (const p of daScrivere) {
      const diverso = p.indirizzo !== p.atteso ? `   ⚠ diverso dal formato atteso (${p.atteso})` : ''
      console.log(`  · ${p.nominativo.padEnd(32)} → ${p.indirizzo}${diverso}`)
    }
  }
  if (ambigui.length) {
    console.log(`\n=== Da decidere a mano (${ambigui.length}) — non toccati`)
    for (const p of ambigui) console.log(`  · ${p.nominativo.padEnd(32)} ${p.motivo}`)
  }
  if (nonTrovati.length) {
    console.log(`\n=== Senza account Microsoft 365 (${nonTrovati.length}) — non toccati`)
    console.log('    Non hanno una casella: va creata prima, oppure non useranno l\'app.')
    for (const p of nonTrovati) {
      console.log(`  · ${p.nominativo.padEnd(32)} atteso: ${slug(p.nome)}.${slug(p.cognome)}@${DOMINIO}${p.personale ? `   (personale: ${p.personale})` : ''}`)
    }
  }

  // --- scrittura ------------------------------------------------------------
  if (!APPLY) {
    console.log(`\n▶ Anteprima conclusa. Per scrivere le ${daScrivere.length} mail:`)
    console.log('    node scripts/completa-mail-aziendali.mjs --apply\n')
    return
  }

  let scritte = 0
  const errori = []
  for (const p of daScrivere) {
    try {
      await graphPatch(tk, `/sites/${site}/lists/${listId}/items/${p.itemId}/fields`, {
        MailAziendale: p.indirizzo,
      })
      scritte++
      console.log(`  ✓ ${p.nominativo} → ${p.indirizzo}`)
    } catch (e) {
      errori.push(`${p.nominativo}: ${e.message}`)
    }
  }

  console.log(`\n▶ Scritte ${scritte} mail su ${daScrivere.length}.`)
  if (errori.length) {
    console.log('\n=== Errori')
    for (const e of errori) console.log(`  · ${e}`)
  }
  console.log('\nOra: Cruscotto Timbrature → "Sincronizza da anagrafica".\n')
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
