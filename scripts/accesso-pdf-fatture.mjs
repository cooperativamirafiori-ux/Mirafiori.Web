#!/usr/bin/env node
/**
 * Dà ai coordinatori dei centri di costo l'accesso in SOLA LETTURA alla
 * cartella SharePoint dove l'import SDI salva i PDF delle fatture
 * ("General/fatture da SDI/Importate" sul sito gruppo_ControlloGestione).
 *
 * Perché: il tasto "Apri il PDF" nelle fatture da segnare apre il link
 * SharePoint diretto, quindi chi non ha accesso alla cartella vede
 * "Non hai accesso". Solo quella cartella, non tutto il sito.
 *
 * Coordinatori = colonne di testo EmailCoordinatori ed EmailResponsabileArea
 * della lista "Centri di Costo" (più la vecchia colonna persona Responsabile,
 * come fa l'app), righe attive: il responsabile d'area conta come coordinatore. Invito senza mail, con accesso obbligatorio.
 * Non toglie mai nessuno: chi non è più coordinatore resta finché non lo si
 * toglie a mano da SharePoint.
 *
 * Uso (dalla cartella web/):
 *   node scripts/accesso-pdf-fatture.mjs            mostra chi ha già accesso e chi manca
 *   node scripts/accesso-pdf-fatture.mjs --apply    dà l'accesso a chi manca
 *   node scripts/accesso-pdf-fatture.mjs --email nome.cognome@cooperativamirafiori.com --apply
 *                                                   aggiunge una persona in più (non coordinatore)
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_CENTRI_COSTO (facoltativo SP_CARTELLA_FATTURE_SDI)
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const arg = (k) => {
  const i = argv.indexOf(k)
  return i > -1 ? argv[i + 1] : undefined
}
const EXTRA = arg('--email')?.toLowerCase()
const COLONNA = 'Responsabile'
const COL_COORDINATORI = 'EmailCoordinatori'
const COL_RESP_AREA = 'EmailResponsabileArea'
const emailDaTesto = (t) =>
  String(t ?? '')
    .split(/[;,\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.includes('@'))
const USER_INFO_LIST = '3f6b4698-931e-4540-a681-d6a436b26bdb'

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

let TOKEN
async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  if (!GRAPH_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    throw new Error('Mancano GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET')
  }
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
  TOKEN ??= await getToken()
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

function lookupPresenti(fields) {
  const v = fields?.[COLONNA]
  if (Array.isArray(v)) return v.map((x) => Number(x?.LookupId)).filter(Boolean)
  const ids = fields?.[`${COLONNA}LookupId`]
  if (Array.isArray(ids)) return ids.map(Number).filter(Boolean)
  return ids ? [Number(ids)].filter(Boolean) : []
}

const percorso = (p) => encodeURIComponent(p).replace(/%2F/g, '/')

/** Email di chi ha già un permesso sulla cartella (diretto o ereditato). */
function emailDaPermesso(p) {
  const fuori = []
  const prendi = (x) => {
    const e = x?.user?.email || x?.user?.userPrincipalName || x?.siteUser?.loginName?.split('|').pop()
    if (e && e.includes('@')) fuori.push(e.toLowerCase())
  }
  prendi(p.grantedToV2)
  for (const g of p.grantedToIdentitiesV2 ?? []) prendi(g)
  return fuori
}

async function main() {
  loadEnvLocal()
  const SITE = process.env.SHAREPOINT_SITE_ID
  const LISTA = process.env.SP_LIST_CENTRI_COSTO
  if (!SITE || !LISTA) throw new Error('Mancano SHAREPOINT_SITE_ID / SP_LIST_CENTRI_COSTO')
  const cartellaPath = `${process.env.SP_CARTELLA_FATTURE_SDI || 'General/fatture da SDI'}/Importate`

  // 1. Coordinatori
  const righe = (
    await graph('GET', `/sites/${SITE}/lists/${LISTA}/items?$select=id&$expand=fields($select=Title,Codice,Attivo,${COLONNA},${COL_COORDINATORI},${COL_RESP_AREA})&$top=500`)
  ).value.filter((r) => r.fields?.Attivo !== false)

  const perEmail = new Map()
  const cacheLookup = new Map()
  const aggiungi = (email, nome, codice) => {
    const v = perEmail.get(email) ?? { nome, cc: [] }
    if (!v.cc.includes(codice)) v.cc.push(codice)
    perEmail.set(email, v)
  }
  for (const r of righe) {
    const codice = String(r.fields.Codice)
    for (const e of emailDaTesto(r.fields[COL_COORDINATORI])) aggiungi(e, e, codice)
    for (const e of emailDaTesto(r.fields[COL_RESP_AREA])) aggiungi(e, e, `${codice} (resp. area)`)
    for (const id of lookupPresenti(r.fields)) {
      if (!cacheLookup.has(id)) {
        const u = await graph('GET', `/sites/${SITE}/lists/${USER_INFO_LIST}/items/${id}?$expand=fields($select=EMail,UserName,Title)`)
        cacheLookup.set(id, { email: String(u.fields?.EMail || u.fields?.UserName || '').toLowerCase(), nome: u.fields?.Title })
      }
      const { email, nome } = cacheLookup.get(id)
      if (!email) continue
      aggiungi(email, nome, codice)
    }
  }
  if (EXTRA) perEmail.set(EXTRA, perEmail.get(EXTRA) ?? { nome: EXTRA, cc: ['(aggiunta a mano)'] })

  // 2. Cartella e permessi attuali
  const cartella = await graph('GET', `/sites/${SITE}/drive/root:/${percorso(cartellaPath)}`)
  const permessi = (await graph('GET', `/sites/${SITE}/drive/items/${cartella.id}/permissions`)).value ?? []
  const giaDentro = new Set(permessi.flatMap(emailDaPermesso))

  console.log(`Cartella: ${cartellaPath}`)
  console.log(`Coordinatori trovati: ${perEmail.size}\n`)

  const mancano = []
  for (const [email, v] of [...perEmail].sort()) {
    const ok = giaDentro.has(email)
    console.log(`  ${ok ? '✓' : '·'} ${email.padEnd(48)} ${v.cc.join(', ')}`)
    if (!ok) mancano.push(email)
  }
  console.log(
    '\n✓ = ha già un permesso esplicito sulla cartella. I membri del sito vedono già tutto\n' +
      '    ma qui compaiono come "·": per loro l\'invito non cambia niente e non fa danni.',
  )

  if (!mancano.length) return console.log('\nNessuno da aggiungere.')
  if (!APPLY) return console.log(`\nDa aggiungere: ${mancano.length}. Rilancia con --apply per dare l'accesso in sola lettura.`)

  for (const email of mancano) {
    try {
      await graph('POST', `/sites/${SITE}/drive/items/${cartella.id}/invite`, {
        recipients: [{ email }],
        roles: ['read'],
        requireSignIn: true,
        sendInvitation: false,
      })
      console.log(`  ✓ accesso in lettura dato a ${email}`)
    } catch (e) {
      console.log(`  ✗ ${email}: ${e.message}`)
    }
  }
  console.log('\nFatto. I link "Apri il PDF" funzionano subito per queste persone.')
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
