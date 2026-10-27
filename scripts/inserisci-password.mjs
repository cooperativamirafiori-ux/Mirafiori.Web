#!/usr/bin/env node
/**
 * Inserisce in blocco voci nella cassaforte "Gestione Password" (Amministrazione).
 *
 * Le credenziali NON stanno in questo file né nel repo: si passano con un JSON
 * esterno (array di voci, stessi campi del form: nome, categoria, nomeUtente,
 * password, pin, linkSito, telefonoVerifica, note).
 *
 * Stesse regole di lib/password/data.ts: DataInserimento = oggi,
 * UltimaModificaPassword = oggi se la voce nasce con una password.
 * Salta le voci il cui nome esiste già (non sovrascrive).
 *
 * Prova a vuoto per default, scrive solo con --applica.
 *
 * Uso (dalla cartella web/):
 *   node scripts/inserisci-password.mjs --file=/percorso/voci.json
 *   node scripts/inserisci-password.mjs --file=/percorso/voci.json --applica
 *
 * Richiede: GRAPH_*, SHAREPOINT_SITE_ID, SP_LIST_PASSWORD.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLICA = process.argv.includes('--applica')
const FILE = process.argv.find((a) => a.startsWith('--file='))?.slice(7)

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
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

async function graph(token, method, path, body, extra = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

const oggi = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
const dataSP = (g) => `${g}T12:00:00Z`

async function main() {
  if (!FILE) throw new Error('Manca --file=/percorso/voci.json')
  loadEnvLocal()
  for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SP_LIST_PASSWORD']) {
    if (!process.env[k]) throw new Error(`Variabile mancante: ${k}`)
  }
  const voci = JSON.parse(readFileSync(resolve(FILE), 'utf8'))
  const base = `/sites/${process.env.SHAREPOINT_SITE_ID}/lists/${process.env.SP_LIST_PASSWORD}`
  const token = await getToken()

  const esistenti = await graph(token, 'GET', `${base}/items?$expand=fields($select=Title)&$top=500`, null, {
    Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
  })
  const nomi = new Set((esistenti.value || []).map((i) => (i.fields?.Title ?? '').trim().toLowerCase()))

  const col = await graph(token, 'GET', `${base}/columns?$select=name,choice`)
  const categorie = col.value.find((c) => c.name === 'Categoria')?.choice?.choices ?? []

  const giorno = oggi()
  for (const v of voci) {
    const nome = (v.nome ?? '').trim()
    if (!nome) { console.log('✗ voce senza nome, saltata'); continue }
    if (nomi.has(nome.toLowerCase())) { console.log(`= "${nome}" esiste già, saltata`); continue }
    if (v.categoria && !categorie.includes(v.categoria)) throw new Error(`Categoria non valida: ${v.categoria}`)
    const fields = {
      Title: nome,
      Categoria: v.categoria || null,
      NomeUtente: (v.nomeUtente ?? '').trim() || null,
      Password: v.password || null,
      Pin: v.pin || null,
      LinkSito: (v.linkSito ?? '').trim() || null,
      TelefonoVerifica: (v.telefonoVerifica ?? '').trim() || null,
      Note: (v.note ?? '').trim() || null,
      DataInserimento: dataSP(giorno),
      UltimaModificaPassword: v.password ? dataSP(giorno) : null,
    }
    if (!APPLICA) { console.log(`→ (prova) "${nome}" [${v.categoria}] utente ${fields.NomeUtente}`); continue }
    const r = await graph(token, 'POST', `${base}/items`, { fields })
    console.log(`✓ "${nome}" inserita (id ${r.id})`)
  }
  if (!APPLICA) console.log('\nProva a vuoto. Per scrivere: aggiungi --applica')
}

main().catch((e) => { console.error(e.message); process.exit(1) })
