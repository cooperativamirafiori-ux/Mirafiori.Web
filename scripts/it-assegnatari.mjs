#!/usr/bin/env node
/**
 * Riempie l'assegnatario nelle assegnazioni migrate dalle liste dell'IT.
 *
 * ## Perché serve
 *
 * Su `gruppo_it` l'utente è un **campo persona**. Con `$expand=fields` secco
 * Graph ne restituisce solo `UtenteLookupId`, un numero che ha senso soltanto
 * dentro l'"elenco informazioni utente" del sito — che è nascosto e che
 * `GET /sites/{id}/lists` non elenca: da lì non si passa (provato con
 * `it-sonda-utenti.mjs`: 404 per titolo, per GUID e come `_catalogs/users`).
 *
 * La strada che funziona è chiedere il campo **per nome**:
 *
 *     $expand=fields($select=Utente,UtenteLookupId)   →   "Utente": "Stefano Martino"
 *
 * Si ottiene il nome visualizzato, non l'indirizzo. L'indirizzo si ricava dalla
 * **rubrica di Entra** (`/users`), che è la stessa fonte che l'app usa per far
 * scegliere le persone: si accoppia per nome, e i casi dubbi non si indovinano —
 * si elencano.
 *
 * ## Uso (dalla cartella web/)
 *
 *   node scripts/it-assegnatari.mjs            prova a vuoto
 *   node scripts/it-assegnatari.mjs --applica  scrive
 *
 * Scrive solo sulle liste dell'app: `gruppo_it` non viene toccato.
 * Permessi Graph necessari: Sites.ReadWrite.All e User.Read.All (già concessi).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLICA = process.argv.includes('--applica')
const SITO_IT = process.argv.find((a) => a.startsWith('--sito='))?.slice(7) ?? 'gruppo_it'
const DOMINIO = 'cooperativamirafiori.com'

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
  if (!res.ok) throw new Error(`${method} ${path.slice(0, 80)} → ${res.status}: ${t.slice(0, 200)}`)
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

const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

/**
 * Nome in forma confrontabile: minuscolo, senza accenti, senza punteggiatura.
 * "Dessì Eleonora" e "eleonora dessi" diventano lo stesso insieme di parole.
 */
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

async function main() {
  loadEnvLocal()
  for (const k of [
    'GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID',
    'SP_LIST_ASSEGNAZIONI', 'SP_LIST_ASSEGNAZIONI_SIM', 'SP_LIST_INVENTARIO', 'SP_LIST_SIM',
  ]) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const site = process.env.SHAREPOINT_SITE_ID
  TOKEN = await getToken()
  console.log(APPLICA ? '── RIPARAZIONE (scrive)' : '── PROVA A VUOTO (non scrive niente)')

  // --- 1. le assegnazioni di origine, col nome della persona -------------
  const host = (process.env.SHAREPOINT_SITE_URL || '').replace(/^https?:\/\//, '').split('/')[0]
    || 'coopmirafiorionlus.sharepoint.com'
  const sitoIT = await graph('GET', `/sites/${host}:/sites/${SITO_IT}?$select=id,webUrl`)
  const listeIT = (await graph('GET', `/sites/${sitoIT.id}/lists?$select=id,displayName&$top=200`)).value || []
  const trova = (n) => {
    const l = listeIT.find((x) => x.displayName === n)
    if (!l) throw new Error(`Lista non trovata su ${SITO_IT}: "${n}"`)
    return l.id
  }

  // `$select=Utente` esplicito: è ciò che fa arrivare il nome visualizzato.
  const CAMPI = '$expand=fields($select=Utente,UtenteLookupId,Stato)&$top=200'
  const [asgDisp, asgSim] = await Promise.all([
    tutte(`/sites/${sitoIT.id}/lists/${trova('Assegnazioni_DISPOSITIVI')}/items?${CAMPI}`),
    tutte(`/sites/${sitoIT.id}/lists/${trova('Assegnazioni_SIM')}/items?${CAMPI}`),
  ])
  const nomePerRiga = new Map()
  for (const [pre, righe] of [['ASG', asgDisp], ['ASGSIM', asgSim]]) {
    for (const r of righe) {
      const nome = txt(r.fields?.Utente)
      if (nome) nomePerRiga.set(`${pre}-${r.id}`, nome)
    }
  }
  console.log(`\nAssegnazioni di origine con una persona: ${nomePerRiga.size}`)

  // --- 2. la rubrica di Entra -------------------------------------------
  const utenti = await tutte(
    '/users?$select=displayName,mail,userPrincipalName,accountEnabled&$top=999',
  )
  const perNome = new Map()
  for (const u of utenti) {
    const mail = txt(u.mail || u.userPrincipalName).toLowerCase()
    if (!mail.endsWith(`@${DOMINIO}`)) continue
    const k = chiaveNome(u.displayName)
    if (!k) continue
    const gruppo = perNome.get(k) ?? []
    gruppo.push({ mail, nome: txt(u.displayName) })
    perNome.set(k, gruppo)
  }
  console.log(`Rubrica Entra: ${perNome.size} nomi distinti nel dominio`)

  const risolti = new Map()
  const ambigui = []
  const ignoti = []
  for (const nome of new Set(nomePerRiga.values())) {
    const gruppo = perNome.get(chiaveNome(nome)) ?? []
    if (gruppo.length === 1) risolti.set(nome, gruppo[0])
    else if (gruppo.length > 1) ambigui.push({ nome, fra: gruppo.map((g) => g.mail) })
    else ignoti.push(nome)
  }
  console.log(`  accoppiati: ${risolti.size} · ambigui: ${ambigui.length} · non trovati: ${ignoti.length}`)
  for (const a of ambigui) console.log(`    ambiguo: "${a.nome}" → ${a.fra.join(' oppure ')}`)
  for (const n of ignoti) console.log(`    non in rubrica: "${n}"`)

  // --- 3. le assegnazioni dell'app --------------------------------------
  const dest = [
    {
      etichetta: 'Assegnazioni Beni',
      lista: process.env.SP_LIST_ASSEGNAZIONI,
      anagrafica: process.env.SP_LIST_INVENTARIO,
      lookup: 'BeneLookupId',
    },
    {
      etichetta: 'Assegnazioni SIM',
      lista: process.env.SP_LIST_ASSEGNAZIONI_SIM,
      anagrafica: process.env.SP_LIST_SIM,
      lookup: 'SimLookupId',
    },
  ]

  let daFare = 0
  let scritte = 0
  let specchi = 0
  const senzaNome = []

  for (const d of dest) {
    const righe = await tutte(
      `/sites/${site}/lists/${d.lista}/items?$expand=fields($select=IdListaIT,AssegnatarioMail,Stato,${d.lookup})&$top=200`,
    )
    const conMail = righe.filter((r) => txt(r.fields?.AssegnatarioMail)).length
    console.log(`\n── ${d.etichetta}: ${righe.length} righe · ${conMail} già con assegnatario`)

    for (const r of righe) {
      const f = r.fields || {}
      if (txt(f.AssegnatarioMail)) continue
      const nome = nomePerRiga.get(txt(f.IdListaIT))
      if (!nome) continue // era davvero senza persona: bene condiviso
      const persona = risolti.get(nome)
      if (!persona) {
        senzaNome.push(`${txt(f.IdListaIT)} · "${nome}"`)
        continue
      }

      daFare++
      console.log(`  ${txt(f.IdListaIT)} → ${persona.nome} <${persona.mail}>`)
      if (!APPLICA) continue

      await graph('PATCH', `/sites/${site}/lists/${d.lista}/items/${r.id}/fields`, {
        AssegnatarioMail: persona.mail,
        AssegnatarioNome: persona.nome,
      })
      scritte++

      // Se è l'assegnazione attiva, l'anagrafica deve dire la stessa cosa:
      // è il campo che l'elenco dell'app mostra senza rileggere lo storico.
      if (txt(f.Stato) === 'Attiva' && f[d.lookup]) {
        await graph('PATCH', `/sites/${site}/lists/${d.anagrafica}/items/${f[d.lookup]}/fields`, {
          AssegnatarioMail: persona.mail,
          AssegnatarioNome: persona.nome,
        })
          .then(() => specchi++)
          .catch((e) => console.log(`    ⚠ anagrafica non allineata: ${String(e.message).slice(-80)}`))
      }
    }
  }

  console.log('\n' + '='.repeat(66))
  if (senzaNome.length) {
    console.log(`Restano senza assegnatario (nome non accoppiabile): ${senzaNome.length}`)
    for (const s of senzaNome) console.log(`  · ${s}`)
    console.log('  Si sistemano dall’app, dalla scheda dell’oggetto → Correggi.')
  }
  if (APPLICA) {
    console.log(`\n✓ ${scritte} assegnazioni ricompilate, ${specchi} anagrafiche allineate.`)
  } else {
    console.log(`\n${daFare} assegnazioni da ricompilare. Per scrivere davvero:`)
    console.log('  node scripts/it-assegnatari.mjs --applica')
  }
  console.log('='.repeat(66) + '\n')
}

main().catch((err) => {
  console.error('\n✗ ERRORE:', err.message)
  process.exit(1)
})
