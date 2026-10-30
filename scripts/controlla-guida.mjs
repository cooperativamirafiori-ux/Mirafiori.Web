#!/usr/bin/env node
// Controlla che la guida d'uso (cartella guida/) sia allineata alle pagine dell'app.
//
//   node scripts/controlla-guida.mjs
//
// Verifica:
//  1. ogni pagina dell'app (app/**/page.tsx) compare nella scheda di una guida;
//  2. ogni percorso nelle schede esiste davvero;
//  3. le voci di `accesso` usano solo il vocabolario di guida/LEGGIMI.md;
//  4. ogni link interno nel testo, es. [Le mie richieste](/mie-richieste), porta a una pagina vera.
// Esce con codice 1 se trova errori, così si può usare prima del commit.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CARTELLA_GUIDA = path.join(RADICE, 'guida')
const CARTELLA_APP = path.join(RADICE, 'app')

const PERMESSI = [
  'Amministrazione', 'Prestazioni Occasionali', 'Timbrature HR', 'Acquisti', 'Beni e IT',
  'Manutenzioni', 'Controllo di Gestione', 'Pagamenti', 'Approvazione Pagamenti',
]
const VOCI_FISSE = [
  'tutti', 'pubblico', 'admin', 'gruppo-ru', 'coordinatore-cc',
  'coordinatore-cura-ambienti', 'responsabile-timbrature',
]
// Pagine che non serve spiegare: la radice rimanda soltanto a /home o al login.
const ESCLUSE = new Set(['/'])

function pagineApp() {
  const out = []
  const giro = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) giro(p)
      else if (e.name === 'page.tsx') {
        const rel = path.relative(CARTELLA_APP, path.dirname(p)).split(path.sep)
          .filter((s) => !/^\(.*\)$/.test(s)) // i gruppi (app), (auth) non entrano nell'indirizzo
        out.push('/' + rel.join('/'))
      }
    }
  }
  giro(CARTELLA_APP)
  return out.map((r) => (r === '/' ? '/' : r.replace(/\/$/, '')))
}

/** Scheda in testa: legge solo la forma usata nelle guide (pagine con percorso/titolo/accesso/cosa). */
function leggiScheda(testo, file, errori) {
  const m = testo.match(/^---\n([\s\S]*?)\n---\n/)
  if (!m) { errori.push(`${file}: manca la scheda in testa (--- … ---)`); return null }
  const righe = m[1].split('\n')
  const scheda = { area: '', pagine: [] }
  let corrente = null
  for (const r of righe) {
    let x
    if ((x = r.match(/^area:\s*(.+)$/))) scheda.area = x[1].trim()
    else if ((x = r.match(/^\s*-\s*percorso:\s*(.+)$/))) {
      corrente = { percorso: x[1].trim(), titolo: '', accesso: [], cosa: '' }
      scheda.pagine.push(corrente)
    } else if (corrente && (x = r.match(/^\s+titolo:\s*(.+)$/))) corrente.titolo = x[1].trim()
    else if (corrente && (x = r.match(/^\s+cosa:\s*(.+)$/))) corrente.cosa = x[1].trim()
    else if (corrente && (x = r.match(/^\s+accesso:\s*\[(.*)\]\s*$/)))
      corrente.accesso = x[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  }
  if (!scheda.area) errori.push(`${file}: manca "area:" nella scheda`)
  return scheda
}

function voceValida(v) {
  if (VOCI_FISSE.includes(v)) return true
  const m = v.match(/^permesso:(.+)$/)
  return !!m && PERMESSI.includes(m[1])
}

/** Un indirizzo vero (/preventivi/nuovo) corrisponde a una pagina con parti variabili (/preventivi/[id])? */
function corrisponde(indirizzo, modello) {
  const a = indirizzo.split('/'), b = modello.split('/')
  if (a.length !== b.length) return false
  return b.every((s, i) => /^\[.+\]$/.test(s) || s === a[i])
}

const errori = []
const avvisi = []
const pagine = pagineApp()
const coperte = new Set()
const file = fs.readdirSync(CARTELLA_GUIDA).filter((f) => f.endsWith('.md') && f !== 'LEGGIMI.md').sort()

for (const f of file) {
  const testo = fs.readFileSync(path.join(CARTELLA_GUIDA, f), 'utf8')
  const scheda = leggiScheda(testo, f, errori)
  if (!scheda) continue
  if (!scheda.pagine.length) errori.push(`${f}: la scheda non elenca nessuna pagina`)
  for (const p of scheda.pagine) {
    if (!pagine.some((x) => corrisponde(p.percorso, x))) errori.push(`${f}: il percorso ${p.percorso} non esiste nell'app`)
    coperte.add(p.percorso)
    if (!p.titolo) errori.push(`${f}: ${p.percorso} senza titolo`)
    if (!p.cosa) errori.push(`${f}: ${p.percorso} senza "cosa"`)
    if (!p.accesso.length) errori.push(`${f}: ${p.percorso} senza "accesso"`)
    for (const v of p.accesso) if (!voceValida(v)) errori.push(`${f}: ${p.percorso} ha una voce di accesso sconosciuta: "${v}"`)
  }
  // Link interni nel testo
  const corpo = testo.replace(/^---\n[\s\S]*?\n---\n/, '')
  for (const [, href] of corpo.matchAll(/\]\((\/[^)\s]*)\)/g)) {
    const indirizzo = href.split(/[?#]/)[0].replace(/\/$/, '') || '/'
    if (!pagine.some((p) => corrisponde(indirizzo, p))) errori.push(`${f}: link a una pagina che non esiste: ${href}`)
  }
  if (!/^## Problemi comuni/m.test(corpo)) avvisi.push(`${f}: manca la sezione "## Problemi comuni"`)
}

for (const p of pagine) {
  if (!ESCLUSE.has(p) && !coperte.has(p)) errori.push(`pagina senza guida: ${p} (aggiungila alla scheda della guida della sua area)`)
}

for (const a of avvisi) console.log('⚠️  ' + a)
for (const e of errori) console.log('❌ ' + e)
if (errori.length) {
  console.log(`\n${errori.length} errori su ${file.length} guide.`)
  process.exit(1)
}
console.log(`✅ Guida a posto: ${file.length} guide, ${coperte.size} pagine descritte su ${pagine.length - ESCLUSE.size}.`)
