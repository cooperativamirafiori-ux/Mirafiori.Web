#!/usr/bin/env node
/**
 * Anagrafica dei PROGETTI delle timbrature, da terminale.
 *
 * L'elenco cambia due o tre volte l'anno: una schermata da mantenere costerebbe
 * piu' di quanto rende, un comando no. Se un domani i progetti cominciassero a
 * cambiare ogni mese, la strada e' una pagina in Amministrazione come Software.
 *
 * Un progetto NON si cancella mai: si disattiva. Le righe di ore che lo citano
 * restano, e un consuntivo che perde le ore di un bando chiuso e' inutile.
 *
 * Uso (da web/):
 *   node scripts/progetti-timbrature.mjs elenco
 *   node scripts/progetti-timbrature.mjs aggiungi "Nuovo Bando 2027"
 *   node scripts/progetti-timbrature.mjs rinomina "Nuove Forme" "Nuove Forme 2"
 *   node scripts/progetti-timbrature.mjs disattiva "Serigrafia"
 *   node scripts/progetti-timbrature.mjs riattiva "Serigrafia"
 *   node scripts/progetti-timbrature.mjs ore 2026-01-01 2026-12-31
 *
 * Legge SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY da .env.local.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* env gia' impostate */ }
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
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const testo = await res.text()
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${testo.slice(0, 300)}`)
  return testo ? JSON.parse(testo) : null
}

const q = (s) => encodeURIComponent(s)

async function trova(nome) {
  const r = await sb('GET', `/progetto?nome=eq.${q(nome)}&select=*`)
  if (!r || r.length === 0) throw new Error(`Progetto "${nome}" non trovato (i nomi sono esatti, maiuscole comprese)`)
  return r[0]
}

async function elenco() {
  const righe = await sb('GET', '/progetto?select=*&order=ordine.asc')
  if (!righe?.length) return console.log('Nessun progetto: esegui supabase/timbrature_progetti.sql')
  console.log(`\n${'ID'.padEnd(5)}${'ORDINE'.padEnd(8)}${'STATO'.padEnd(12)}NOME`)
  for (const p of righe) {
    console.log(
      `${String(p.id).padEnd(5)}${String(p.ordine).padEnd(8)}${(p.attivo ? 'attivo' : 'disattivato').padEnd(12)}${p.nome}`,
    )
  }
  console.log()
}

async function aggiungi(nome) {
  const righe = await sb('GET', '/progetto?select=ordine&order=ordine.desc&limit=1')
  const ordine = (righe?.[0]?.ordine ?? 0) + 10
  const [creato] = await sb('POST', '/progetto', [{ nome, ordine, attivo: true }])
  console.log(`Aggiunto: #${creato.id} ${creato.nome} (ordine ${creato.ordine})`)
}

async function rinomina(nome, nuovo) {
  const p = await trova(nome)
  await sb('PATCH', `/progetto?id=eq.${p.id}`, { nome: nuovo })
  console.log(`#${p.id}: "${p.nome}" → "${nuovo}". Le righe di ore restano collegate.`)
}

async function attiva(nome, attivo) {
  const p = await trova(nome)
  await sb('PATCH', `/progetto?id=eq.${p.id}`, { attivo })
  console.log(
    attivo
      ? `#${p.id} ${p.nome}: riattivato, torna nella tendina.`
      : `#${p.id} ${p.nome}: disattivato. Non compare piu' nella tendina; le ore gia' registrate restano.`,
  )
}

/** Consuntivo veloce: le stesse somme della pagina "Ore per progetto". */
async function ore(dal, al) {
  const serv = await sb('GET', '/servizio?chiede_progetto=is.true&select=id')
  const ids = (serv ?? []).map((s) => s.id)
  if (!ids.length) return console.log('Nessun servizio chiede il progetto.')
  const righe = await sb(
    'GET',
    `/timbratura?servizio_id=in.(${ids.join(',')})&data=gte.${dal}&data=lte.${al}&select=ore,progetto_id`,
  )
  const progetti = await sb('GET', '/progetto?select=id,nome')
  const nomi = new Map((progetti ?? []).map((p) => [p.id, p.nome]))
  const tot = new Map()
  for (const r of righe ?? []) {
    const k = r.progetto_id ?? 0
    tot.set(k, (tot.get(k) ?? 0) + Number(r.ore))
  }
  const out = [...tot.entries()]
    .map(([k, v]) => ({ nome: k === 0 ? '— senza progetto —' : (nomi.get(k) ?? `#${k}`), ore: v }))
    .sort((a, b) => b.ore - a.ore)
  console.log(`\nOre di progettazione dal ${dal} al ${al}\n`)
  for (const r of out) console.log(`${r.nome.padEnd(32)}${r.ore.toFixed(2).replace('.', ',')} h`)
  console.log(`${'TOTALE'.padEnd(32)}${out.reduce((s, r) => s + r.ore, 0).toFixed(2).replace('.', ',')} h\n`)
}

const USO = `Uso:
  node scripts/progetti-timbrature.mjs elenco
  node scripts/progetti-timbrature.mjs aggiungi "Nome progetto"
  node scripts/progetti-timbrature.mjs rinomina "Vecchio" "Nuovo"
  node scripts/progetti-timbrature.mjs disattiva "Nome progetto"
  node scripts/progetti-timbrature.mjs riattiva "Nome progetto"
  node scripts/progetti-timbrature.mjs ore 2026-01-01 2026-12-31`

async function main() {
  loadEnvLocal()
  const [cmd, a, b] = process.argv.slice(2)
  switch (cmd) {
    case 'elenco': return elenco()
    case 'aggiungi': if (!a) throw new Error(USO); return aggiungi(a)
    case 'rinomina': if (!a || !b) throw new Error(USO); return rinomina(a, b)
    case 'disattiva': if (!a) throw new Error(USO); return attiva(a, false)
    case 'riattiva': if (!a) throw new Error(USO); return attiva(a, true)
    case 'ore': if (!a || !b) throw new Error(USO); return ore(a, b)
    default: console.log(USO)
  }
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`)
  process.exit(1)
})
