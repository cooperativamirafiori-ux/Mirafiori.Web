#!/usr/bin/env node
/**
 * Allinea lo specchio Supabase `centro_di_costo` alla lista SharePoint
 * "Centri di Costo", che resta la fonte di verità.
 *
 * Perché uno specchio, se l'anagrafica è già su SharePoint. Per due cose che
 * SharePoint non può dare al registro: le **foreign key** — un `cc_codice`
 * storpiato in `movimento` non passa, e prima si sarebbe sbagliato in silenzio
 * — e le **aggregazioni**, perché non si fa un GROUP BY leggendo un'altra
 * piattaforma. Il collegamento è sempre per CODICE (cc1…cc23), mai per id
 * SharePoint: sono due database distinti e un id non ha senso fuori dal suo.
 *
 * Uso (dalla cartella web/):
 *   node scripts/sync-centri-costo-supabase.mjs          # mostra cosa farebbe
 *   node scripts/sync-centri-costo-supabase.mjs --apply  # scrive
 *
 * Va rilanciato quando si aggiunge, rinomina o spegne un centro di costo su
 * SharePoint. Non è un cron: succede due o tre volte l'anno, e un
 * disallineamento si vede subito perché il codice nuovo viene rifiutato dal
 * registro invece di entrare come valore libero.
 *
 * Richiede in .env.local (o nell'ambiente):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, SHAREPOINT_SITE_ID
 *   SP_LIST_CENTRI_COSTO
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * ⚠️ NON CANCELLA MAI NIENTE. Un centro di costo non si elimina — lo storico
 * del registro lo referenzia e la foreign key lo impedirebbe comunque: se su
 * SharePoint sparisce, qui viene solo messo `attivo = false` e segnalato.
 * `DA_ATTRIBUIRE` è nostro, non sta su SharePoint, e non si tocca.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

/** Il segnaposto dei non attribuiti: nostro, non arriva da SharePoint. */
const SEGNAPOSTO = 'DA_ATTRIBUIRE'

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // .env.local assente: si presume env già impostate
  }
}

async function getToken() {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env
  if (!GRAPH_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    throw new Error('Mancano GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET')
  }
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

async function graph(token, path) {
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

async function sb(metodo, path, body) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  if (!base || !key) throw new Error('Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const res = await fetch(`${base}/rest/v1${path}`, {
    method: metodo,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: metodo === 'POST' ? 'resolution=merge-duplicates,return=representation' : 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const testo = await res.text()
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${testo.slice(0, 400)}`)
  return testo ? JSON.parse(testo) : null
}

async function main() {
  loadEnvLocal()

  const site = process.env.SHAREPOINT_SITE_ID
  const lista = process.env.SP_LIST_CENTRI_COSTO
  if (!site || !lista) throw new Error('Mancano SHAREPOINT_SITE_ID / SP_LIST_CENTRI_COSTO')

  const token = await getToken()
  const res = await graph(
    token,
    `/sites/${site}/lists/${lista}/items?$select=id&$expand=fields($select=Title,Codice,Area,Attivo,Ordine)&$top=500`,
  )

  const daSp = (res.value || [])
    .map((i) => ({
      codice: String(i.fields?.Codice ?? '').trim(),
      nome: String(i.fields?.Title ?? '').trim(),
      area: String(i.fields?.Area ?? '').trim() || null,
      ordine: Number(i.fields?.Ordine ?? 999),
      attivo: i.fields?.Attivo !== false,
      sp_item_id: Number(i.id),
    }))
    .filter((c) => c.codice && c.nome)

  if (daSp.length === 0) {
    throw new Error('La lista SharePoint non ha restituito nessun centro di costo: mi fermo senza scrivere')
  }

  const attuali = (await sb('GET', '/centro_di_costo?select=codice,nome,area,ordine,attivo')) || []
  const perCodice = new Map(attuali.map((c) => [c.codice, c]))

  const nuovi = []
  const cambiati = []
  for (const c of daSp) {
    const vecchio = perCodice.get(c.codice)
    if (!vecchio) {
      nuovi.push(c)
      continue
    }
    const diff = []
    if (vecchio.nome !== c.nome) diff.push(`nome: "${vecchio.nome}" → "${c.nome}"`)
    if ((vecchio.area ?? null) !== c.area) diff.push(`area: "${vecchio.area ?? '∅'}" → "${c.area ?? '∅'}"`)
    if (Number(vecchio.ordine) !== c.ordine) diff.push(`ordine: ${vecchio.ordine} → ${c.ordine}`)
    if (vecchio.attivo !== c.attivo) diff.push(`attivo: ${vecchio.attivo} → ${c.attivo}`)
    if (diff.length > 0) cambiati.push({ ...c, diff })
  }

  // Presenti qui e non più su SharePoint. Non si cancellano: si spengono.
  const codiciSp = new Set(daSp.map((c) => c.codice))
  const spariti = attuali.filter(
    (c) => c.codice !== SEGNAPOSTO && !codiciSp.has(c.codice) && c.attivo,
  )

  console.log(`\nCentri di costo su SharePoint: ${daSp.length}`)
  console.log(`Presenti su Supabase:          ${attuali.length} (compreso ${SEGNAPOSTO})\n`)

  if (nuovi.length) {
    console.log(`Nuovi (${nuovi.length}):`)
    for (const c of nuovi) console.log(`  + ${c.codice.padEnd(14)} ${c.nome}`)
    console.log()
  }
  if (cambiati.length) {
    console.log(`Da aggiornare (${cambiati.length}):`)
    for (const c of cambiati) console.log(`  ~ ${c.codice.padEnd(14)} ${c.diff.join(' · ')}`)
    console.log()
  }
  if (spariti.length) {
    console.log(`⚠️  Non più su SharePoint (${spariti.length}) — li spengo, non li cancello:`)
    for (const c of spariti) console.log(`  ! ${c.codice.padEnd(14)} ${c.nome}`)
    console.log()
  }
  if (!nuovi.length && !cambiati.length && !spariti.length) {
    console.log('Già allineati: niente da fare.\n')
    return
  }

  if (!APPLY) {
    console.log('Prova a vuoto. Per scrivere: node scripts/sync-centri-costo-supabase.mjs --apply\n')
    return
  }

  // Un upsert solo per tutte le righe di SharePoint: `Prefer:
  // resolution=merge-duplicates` sulla primary key `codice`.
  const payload = daSp.map((c) => ({
    codice: c.codice,
    nome: c.nome,
    area: c.area,
    ordine: c.ordine,
    attivo: c.attivo,
    sp_item_id: c.sp_item_id,
    sincronizzato_il: new Date().toISOString(),
  }))
  await sb('POST', '/centro_di_costo', payload)

  for (const c of spariti) {
    await sb('PATCH', `/centro_di_costo?codice=eq.${encodeURIComponent(c.codice)}`, {
      attivo: false,
      sincronizzato_il: new Date().toISOString(),
    })
  }

  console.log(`✓ Scritti ${payload.length} centri di costo, spenti ${spariti.length}.\n`)
}

main().catch((err) => {
  console.error('\n✗', err.message, '\n')
  process.exit(1)
})
