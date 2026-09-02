#!/usr/bin/env node
/**
 * Seed del permesso "Manutenzioni" ai responsabili di struttura.
 *
 * Legge la lista SP "Strutture" (colonne persona Responsabile e
 * ResponsabilePulizie) e crea, per ogni email trovata, una riga nella lista
 * "Autorizzazioni" con Area = "Manutenzioni".
 *
 * È un punto di partenza, non una sincronizzazione: dopo il seed la fonte che
 * conta è la lista Autorizzazioni, amministrata da Amministrazione › Permessi.
 * Lo script non revoca niente e non va messo in cron — se domani cambia un
 * responsabile, si aggiorna il permesso dal pannello (o si rilancia questo per
 * i nuovi, che non tocca gli esistenti).
 *
 * Uso (dalla cartella web/):
 *   node scripts/seed-permessi-manutenzioni.mjs --dry-run    # mostra e non scrive
 *   node scripts/seed-permessi-manutenzioni.mjs              # scrive
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_STRUTTURE, SP_LIST_AUTORIZZAZIONI.
 * Permesso Graph: Sites.ReadWrite.All (Application).
 *
 * Idempotente: salta chi ha già il permesso.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const AREA = 'Manutenzioni'
const DOMINIO = '@cooperativamirafiori.com'
const DRY_RUN = process.argv.includes('--dry-run')

// "Elenco informazioni utente" del sito: GUID fisso, lo stesso di lib/core/sp.ts.
// Serve perché le colonne persona, via Graph, tornano solo come <Nome>LookupId
// e l'email va risolta qui.
const SP_USER_INFO_LIST = '3f6b4698-931e-4540-a681-d6a436b26bdb'

// Gli admin passano già per conto loro (lib/core/permessi.ts): dare loro anche
// il permesso "richiedente" aggiungerebbe righe che non decidono niente.
const ADMIN = [
  'dennis.maseri@cooperativamirafiori.com',
  'stefano.martino@cooperativamirafiori.com',
  'gabriele.uscello@cooperativamirafiori.com',
]

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
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

async function graph(token, method, path, body, extraHeaders = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

/**
 * Email di una colonna persona.
 *
 * Graph, espandendo `fields`, per una colonna persona NON restituisce l'email:
 * restituisce `<Nome>LookupId`. L'email si legge sull'elenco informazioni
 * utente del sito, una richiesta per persona — con cache, perché gli stessi
 * responsabili ricorrono su più strutture.
 */
const cacheEmail = new Map()

async function emailDaLookupId(token, site, lookupId) {
  const id = Number(lookupId)
  if (!id) return ''
  if (cacheEmail.has(id)) return cacheEmail.get(id)
  let email = ''
  try {
    const res = await graph(
      token,
      'GET',
      `/sites/${site}/lists/${SP_USER_INFO_LIST}/items/${id}?$expand=fields`,
    )
    email = (res?.fields?.EMail ?? res?.fields?.UserName ?? '').trim().toLowerCase()
  } catch {
    // Utente rimosso dal sito o lookup orfano: si salta, non si interrompe.
    email = ''
  }
  cacheEmail.set(id, email)
  return email
}

/** Prende sia il campo espanso (se c'è) sia il LookupId, e ne cava l'email. */
async function emailDiPersona(token, site, campo, lookupId) {
  if (campo && typeof campo === 'object') {
    const e = (campo.Email ?? campo.email ?? '').trim().toLowerCase()
    if (e) return e
  }
  if (typeof campo === 'string' && campo.includes('@')) return campo.trim().toLowerCase()
  return emailDaLookupId(token, site, lookupId)
}

async function main() {
  loadEnvLocal()
  for (const k of [
    'GRAPH_TENANT_ID',
    'GRAPH_CLIENT_ID',
    'GRAPH_CLIENT_SECRET',
    'SHAREPOINT_SITE_ID',
    'SP_LIST_STRUTTURE',
    'SP_LIST_AUTORIZZAZIONI',
  ]) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  const listStrutture = process.env.SP_LIST_STRUTTURE
  const listAut = process.env.SP_LIST_AUTORIZZAZIONI

  console.log(`→ Autenticazione Graph...${DRY_RUN ? '  (DRY RUN: non scrive)' : ''}`)
  const token = await getToken()

  console.log('→ Lettura strutture e responsabili...')
  const strutture = await graph(
    token,
    'GET',
    `/sites/${site}/lists/${listStrutture}/items?$select=id&$expand=fields&$top=500`,
    undefined,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
  )

  // email -> strutture per cui è responsabile (serve solo per stampare il perché)
  const trovati = new Map()
  const senzaResponsabile = []
  const ignorate = []
  for (const item of strutture.value || []) {
    const f = item.fields || {}
    const etichetta = f.Codice ? `${f.Codice} — ${f.Title ?? ''}`.trim() : (f.Title ?? `#${item.id}`)
    // Le strutture "ZZ_…" sono state unificate in altre: chi le ha in carico
    // non prende il permesso per una sede che non esiste più. Se serve, si dà
    // dal pannello.
    if (String(f.Title ?? '').startsWith('ZZ_')) {
      ignorate.push(etichetta)
      continue
    }
    const mail = [
      await emailDiPersona(token, site, f.Responsabile, f.ResponsabileLookupId),
      await emailDiPersona(token, site, f.ResponsabilePulizie, f.ResponsabilePulizieLookupId),
    ].filter((e) => e.endsWith(DOMINIO))
    if (!mail.length) senzaResponsabile.push(etichetta)
    for (const e of mail) {
      if (!trovati.has(e)) trovati.set(e, [])
      if (!trovati.get(e).includes(etichetta)) trovati.get(e).push(etichetta)
    }
  }

  console.log('→ Lettura permessi già presenti...')
  const esistenti = await graph(
    token,
    'GET',
    `/sites/${site}/lists/${listAut}/items?$select=id&$expand=fields($select=Utente,Area)&$top=500`,
  )
  const giaAssegnati = new Set(
    (esistenti.value || [])
      .filter((r) => r.fields?.Area === AREA && r.fields?.Utente)
      .map((r) => String(r.fields.Utente).toLowerCase()),
  )

  const daFare = []
  console.log(`\nResponsabili di struttura trovati: ${trovati.size}\n`)
  for (const [email, dove] of [...trovati.entries()].sort()) {
    const nota = dove.join(', ')
    if (ADMIN.includes(email)) {
      console.log(`  ·  ${email}  → admin, salta  (${nota})`)
    } else if (giaAssegnati.has(email)) {
      console.log(`  ✓  ${email}  → permesso già presente  (${nota})`)
    } else {
      console.log(`  +  ${email}  → da assegnare  (${nota})`)
      daFare.push(email)
    }
  }

  if (ignorate.length) {
    console.log('\n· Strutture unificate/dismesse (ZZ_), non contate:')
    for (const s of ignorate) console.log(`     ${s}`)
  }

  if (senzaResponsabile.length) {
    console.log(`\n⚠ Strutture senza responsabile con email ${DOMINIO}:`)
    for (const s of senzaResponsabile) console.log(`     ${s}`)
  }

  if (!daFare.length) {
    console.log('\n✓ Niente da fare: tutti i responsabili hanno già il permesso.')
    return
  }

  if (DRY_RUN) {
    console.log(`\nDRY RUN: ${daFare.length} permessi da creare. Rilancia senza --dry-run per scrivere.`)
    return
  }

  console.log(`\n→ Creazione di ${daFare.length} permessi...`)
  for (const email of daFare) {
    await graph(token, 'POST', `/sites/${site}/lists/${listAut}/items`, {
      fields: { Title: email, Utente: email, Area: AREA },
    })
    console.log(`  + ${email} → ${AREA}`)
  }
  console.log('\n✓ Fatto. Da qui in poi si gestisce da Amministrazione › Permessi.')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
