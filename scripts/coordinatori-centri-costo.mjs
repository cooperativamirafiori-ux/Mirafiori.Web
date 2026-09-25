#!/usr/bin/env node
/**
 * Coordinatori dei centri di costo, sulla lista SharePoint "Centri di Costo".
 *
 * Fa due cose:
 *   1. prepara la colonna, una volta sola: nome interno `Responsabile` (non si
 *      cambia), nome visibile "Coordinatori", più persone ammesse (coordinatore
 *      e vice);
 *   2. nomina un coordinatore su un centro di costo, AGGIUNGENDOLO a quelli già
 *      presenti (con --sostituisci li rimpiazza; con --togli lo toglie).
 *
 * Il coordinatore vede in app il conto Qonto del suo servizio (Controllo di
 * Gestione → Qonto). L'app rilegge la lista ogni 5 minuti.
 *
 * Uso (dalla cartella web/):
 *   node scripts/coordinatori-centri-costo.mjs                                   # elenco + cosa manca alla colonna
 *   node scripts/coordinatori-centri-costo.mjs --cc cc18 --email nome.cognome@cooperativamirafiori.com
 *   node scripts/coordinatori-centri-costo.mjs --cc cc18 --email ... --apply
 *   node scripts/coordinatori-centri-costo.mjs --cc cc18 --email ... --togli --apply
 *
 * Senza --apply non scrive niente.
 *
 * Richiede in .env.local: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 * SHAREPOINT_SITE_ID, SP_LIST_CENTRI_COSTO
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const TOGLI = argv.includes('--togli')
const SOSTITUISCI = argv.includes('--sostituisci')
const arg = (k) => {
  const i = argv.indexOf(k)
  return i > -1 ? argv[i + 1] : undefined
}
const CC = arg('--cc')?.toLowerCase()
const EMAIL = arg('--email')?.toLowerCase()
const COLONNA = 'Responsabile'
const ETICHETTA = 'Coordinatori'
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

async function emailDaLookup(id) {
  const r = await graph('GET', `/sites/${SITE}/lists/${USER_INFO_LIST}/items/${id}?$expand=fields($select=EMail,UserName,Title)`)
  return String(r.fields?.EMail || r.fields?.UserName || `#${id}`).toLowerCase()
}

async function lookupDaEmail(email) {
  const f = encodeURIComponent(`fields/EMail eq '${email}'`)
  const r = await graph('GET', `/sites/${SITE}/lists/${USER_INFO_LIST}/items?$expand=fields($select=id,EMail,Title)&$filter=${f}&$top=1`)
  return r.value?.[0] ? { id: Number(r.value[0].id), nome: r.value[0].fields?.Title ?? email } : null
}

/** LookupId già presenti sulla riga, singola o multipla che sia la colonna. */
function lookupPresenti(fields) {
  const v = fields?.[COLONNA]
  if (Array.isArray(v)) return v.map((x) => Number(x?.LookupId)).filter(Boolean)
  const ids = fields?.[`${COLONNA}LookupId`]
  if (Array.isArray(ids)) return ids.map(Number).filter(Boolean)
  return ids ? [Number(ids)].filter(Boolean) : []
}

let SITE, LISTA

async function main() {
  loadEnvLocal()
  SITE = process.env.SHAREPOINT_SITE_ID
  LISTA = process.env.SP_LIST_CENTRI_COSTO
  if (!SITE || !LISTA) throw new Error('Mancano SHAREPOINT_SITE_ID / SP_LIST_CENTRI_COSTO')
  if ((CC && !EMAIL) || (!CC && EMAIL)) throw new Error('Servono insieme --cc e --email')

  // 1. La colonna
  const col = (await graph('GET', `/sites/${SITE}/lists/${LISTA}/columns`)).value.find((c) => c.name === COLONNA)
  if (!col) throw new Error(`Colonna ${COLONNA} non trovata sulla lista Centri di Costo`)
  const multipla = Boolean(col.personOrGroup?.allowMultipleSelection)
  const daSistemare = col.displayName !== ETICHETTA || !multipla
  console.log(`Colonna: "${col.displayName}" (interno ${COLONNA}) · più persone: ${multipla ? 'sì' : 'no'}`)
  if (daSistemare) {
    if (APPLY) {
      await graph('PATCH', `/sites/${SITE}/lists/${LISTA}/columns/${col.id}`, {
        displayName: ETICHETTA,
        personOrGroup: { ...(col.personOrGroup ?? {}), allowMultipleSelection: true },
      })
      console.log(`  ✓ ora si chiama "${ETICHETTA}" e accetta più persone`)
    } else {
      console.log(`  → da sistemare: nome "${ETICHETTA}", più persone ammesse (con --apply)`)
    }
  }

  // 2. Le righe
  const righe = (
    await graph('GET', `/sites/${SITE}/lists/${LISTA}/items?$select=id&$expand=fields($select=Title,Codice,Attivo,${COLONNA})&$top=500`)
  ).value
    .filter((r) => r.fields?.Attivo !== false)
    .sort((a, b) => Number(String(a.fields.Codice).slice(2)) - Number(String(b.fields.Codice).slice(2)))

  if (!CC) {
    console.log('\nCoordinatori attuali:')
    for (const r of righe) {
      const ids = lookupPresenti(r.fields)
      const email = await Promise.all(ids.map(emailDaLookup))
      console.log(`  ${String(r.fields.Codice).padEnd(5)} ${String(r.fields.Title).padEnd(36)} ${email.join(', ') || '—'}`)
    }
    return
  }

  const riga = righe.find((r) => String(r.fields.Codice).toLowerCase() === CC)
  if (!riga) throw new Error(`Centro di costo ${CC} non trovato (o spento)`)
  const utente = await lookupDaEmail(EMAIL)
  if (!utente) {
    throw new Error(
      `${EMAIL} non è ancora nell'elenco utenti del sito SharePoint.\n` +
        `  Succede a chi non ha mai aperto il sito. Soluzione, una volta sola: apri la lista\n` +
        `  "Centri di Costo" su SharePoint, modifica la riga ${CC} e scegli la persona nella\n` +
        `  colonna ${ETICHETTA}. Da lì in poi lo script la trova.`,
    )
  }

  const prima = lookupPresenti(riga.fields)
  let dopo = SOSTITUISCI ? [utente.id] : [...new Set([...prima, utente.id])]
  if (TOGLI) dopo = prima.filter((id) => id !== utente.id)
  const emailPrima = await Promise.all(prima.map(emailDaLookup))
  console.log(`\n${CC} · ${riga.fields.Title}`)
  console.log(`  prima: ${emailPrima.join(', ') || '—'}`)
  console.log(`  ${TOGLI ? 'tolgo' : 'aggiungo'}: ${utente.nome} <${EMAIL}>`)

  if (dopo.length === prima.length && dopo.every((id, i) => id === prima[i])) {
    return console.log('  niente da cambiare.')
  }
  if (!APPLY) return console.log('  Rilancia con --apply per scrivere.')
  if (daSistemare && dopo.length > 1) throw new Error('La colonna non accetta ancora più persone: non dovrebbe succedere dopo --apply')

  const campi = multipla || daSistemare
    ? { [`${COLONNA}LookupId@odata.type`]: 'Collection(Edm.Int32)', [`${COLONNA}LookupId`]: dopo }
    : { [`${COLONNA}LookupId`]: dopo[0] ?? null }
  await graph('PATCH', `/sites/${SITE}/lists/${LISTA}/items/${riga.id}/fields`, campi)
  console.log('  ✓ salvato. L\'app se ne accorge entro 5 minuti.')
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
