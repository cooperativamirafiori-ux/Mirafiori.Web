#!/usr/bin/env node
/**
 * mappa.mjs — rigenera MAPPA.md, l'indice sempre aggiornato del progetto.
 *
 *   npm run mappa
 *
 * Produce, in web/MAPPA.md:
 *   1. i file oltre soglia righe (candidati da spezzare)
 *   2. un blocco per ogni area funzionale, con righe per file ed export di lib/
 *   3. le dipendenze fra moduli lib (chi importa chi) e i moduli trasversali
 *   4. i file NON mappati ad alcuna area — serve per accorgersi delle aree nuove
 *
 * Nessuna dipendenza esterna. Non modifica niente: scrive solo MAPPA.md.
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOGLIA_RIGHE = 500
const IGNORA = ['node_modules', '.next', '.git', '.vercel', '_to_delete', '_rimossi', 'ru-data']
const ESTENSIONI = ['.ts', '.tsx', '.mjs', '.md', '.sh', '.py', '.css']

/**
 * Le aree, nell'ordine in cui vanno testate: la PRIMA che combacia vince.
 * Quindi le più specifiche stanno sopra (timbrature prima di risorse-umane,
 * amministrazione/permessi prima di amministrazione).
 * Aggiungendo un'area nuova all'app, aggiungila qui: se non lo fai, i suoi file
 * compaiono in fondo a MAPPA.md sotto "file non mappati".
 */
const AREE = [
  {
    nome: 'Timbrature · Foglio ore',
    prefissi: [
      'app/(app)/timbrature', 'app/(app)/risorse-umane/timbrature', 'app/api/timbrature',
      'app/foglio-ore', 'app/api/foglio-ore', 'app/api/cron/timbrature-alert',
      'app/api/cron/sollecito-timbrature', 'app/api/cron/promemoria-ore',
      'lib/timbrature', 'lib/foglio-ore-xlsx', 'lib/festivita', 'lib/supabase',
      'docs/timbrature', 'docs/Progettazione_Sezione_Timbrature',
      'scripts/sync-timbrature', 'scripts/diagnosi-mail-timbrature',
    ],
  },
  {
    nome: 'Manutenzioni',
    prefissi: [
      'app/(app)/manutenzioni', 'app/(app)/nuova-richiesta', 'app/(app)/mie-richieste',
      'app/(app)/dashboard', 'app/(app)/gestione', 'app/api/manutenzioni', 'lib/manutenzioni', 'lib/strutture',
    ],
  },
  {
    nome: 'Costi strutture',
    prefissi: ['app/(app)/inserisci-costo', 'app/(app)/cruscotto-costi', 'app/api/costi', 'lib/costi'],
  },
  {
    nome: 'Acquisti',
    prefissi: [
      'app/(app)/acquisti', 'app/api/acquisti', 'app/consegna', 'app/api/consegna',
      'app/api/cron/acquisti', 'lib/acquisti', 'scripts/provision-acquisti', 'docs/acquisti',
    ],
  },
  {
    nome: 'Prestazioni occasionali',
    prefissi: [
      'app/(app)/prestazioni', 'app/api/prestazioni', 'app/api/prestatori', 'app/notula',
      'app/api/notula', 'app/api/docusign', 'lib/prestazioni', 'lib/documenti-prestazione',
      'lib/firma-prestazione', 'lib/docusign', 'lib/casistiche-gdpr', 'lib/templates',
      'lib/allegati-prestatore', 'docs/prestazioni', 'docs/docusign', 'scripts/provision-prestazioni',
    ],
  },
  {
    nome: 'Risorse Umane',
    prefissi: [
      'app/(app)/risorse-umane', 'app/api/risorse-umane', 'lib/risorse-umane', 'lib/ru-',
      'lib/gruppo-ru', 'lib/graph-delegato', 'docs/risorse-umane', 'docs/piano-ru', 'docs/runbook-ru',
      'scripts/provision-risorse-umane', 'scripts/ru-', 'scripts/import-', 'scripts/migra',
      'scripts/completa-mail-aziendali', 'scripts/extract-da-accdb', 'scripts/fix-cf',
      'scripts/diagnosi-gruppo-ru', 'scripts/vercel-env-ru', 'scripts/elimina-lista-collaboratori',
      'scripts/cedolini-mansione-map', 'scripts/aggiungi-colonna-ru',
      'scripts/crea-cartelle-dipendenti', 'scripts/diagnosi-stato-rapporto',
    ],
  },
  {
    nome: 'Inventario beni',
    prefissi: ['app/(app)/inventario', 'app/api/inventario', 'lib/inventario', 'scripts/provision-inventario'],
  },
  {
    nome: 'Amministrazione · Permessi',
    prefissi: [
      'app/(app)/amministrazione/permessi', 'app/api/permessi', 'lib/permessi', 'lib/core/permessi',
      'scripts/provision-autorizzazioni', 'scripts/diagnosi-permessi',
    ],
  },
  {
    nome: 'Amministrazione · Software',
    prefissi: [
      'app/(app)/amministrazione/software', 'app/api/software', 'lib/software',
      'lib/calendar', 'scripts/provision-software',
    ],
  },
  { nome: 'Amministrazione (hub)', prefissi: ['app/(app)/amministrazione'] },
  {
    nome: 'Log attività',
    prefissi: ['lib/audit', 'docs/log-attivita', 'scripts/provision-log-attivita', 'docs/Domande_Consulenti_Log'],
  },
  {
    nome: 'Home / hub',
    prefissi: [
      'app/(app)/home', 'app/(app)/amazing', 'app/(app)/layout', 'app/layout',
      'app/page', 'app/globals',
    ],
  },
  {
    nome: 'Accesso / login',
    prefissi: ['app/(auth)', 'app/api/auth', 'lib/auth', 'lib/ms-token', 'middleware'],
  },
  {
    nome: 'Infrastruttura condivisa (core)',
    prefissi: [
      'lib/core', 'lib/graph', 'lib/sharepoint', 'lib/api-guard', 'lib/notifications',
      'lib/upload-diretto', 'components', 'types', 'app/api/debug-fields',
      'scripts/get-site-id', 'scripts/sp-liste', 'scripts/setup-env-locale', 'scripts/pulisci-choice',
      'scripts/mappa', 'scripts/riordino', 'tailwind.config', 'next.config', 'postcss.config', 'supabase/',
    ],
  },
]

// ─── raccolta file ────────────────────────────────────────────────────────────

function scansiona(dir, acc = []) {
  for (const voce of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORA.includes(voce.name) || voce.name.startsWith('~$')) continue
    const percorso = join(dir, voce.name)
    if (voce.isDirectory()) scansiona(percorso, acc)
    else if (ESTENSIONI.some((e) => voce.name.endsWith(e))) acc.push(percorso)
  }
  return acc
}

const file = []
for (const radice of ['app', 'lib', 'components', 'types', 'docs', 'scripts', 'supabase']) {
  try {
    scansiona(join(ROOT, radice), file)
  } catch {
    /* cartella assente: ok */
  }
}
for (const singolo of ['middleware.ts', 'tailwind.config.ts', 'next.config.mjs']) {
  try {
    statSync(join(ROOT, singolo)) && file.push(join(ROOT, singolo))
  } catch {
    /* assente: ok */
  }
}

const info = file.map((percorso) => {
  const rel = relative(ROOT, percorso).split('\\').join('/')
  const testo = readFileSync(percorso, 'utf8')
  return {
    rel,
    righe: testo.split('\n').length,
    kb: Math.round(statSync(percorso).size / 1024),
    testo,
    isLib: rel.startsWith('lib/') && (rel.endsWith('.ts') || rel.endsWith('.tsx')),
  }
})

// ─── classificazione per area ─────────────────────────────────────────────────

const perArea = new Map(AREE.map((a) => [a.nome, []]))
const orfani = []
for (const f of info) {
  const area = AREE.find((a) => a.prefissi.some((p) => f.rel.startsWith(p)))
  if (area) perArea.get(area.nome).push(f)
  else orfani.push(f)
}

// ─── export e dipendenze dei moduli lib ──────────────────────────────────────

const RE_EXPORT = /^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/gm
const RE_IMPORT = /from\s+['"]@\/lib\/([a-z0-9-]+(?:\/[a-z0-9-]+)?)['"]/g

function esporta(testo) {
  return [...testo.matchAll(RE_EXPORT)].map((m) => m[1])
}
function dipendenze(testo) {
  return [...new Set([...testo.matchAll(RE_IMPORT)].map((m) => m[1]))].sort()
}

const areaDi = new Map()
for (const [nome, files] of perArea) for (const f of files) areaDi.set(f.rel, nome)

const usatoDa = new Map() // modulo lib → { file: Set, aree: Set }
for (const f of info) {
  for (const dep of dipendenze(f.testo)) {
    if (!usatoDa.has(dep)) usatoDa.set(dep, { file: new Set(), aree: new Set() })
    usatoDa.get(dep).file.add(f.rel)
    usatoDa.get(dep).aree.add(areaDi.get(f.rel) ?? '(non mappato)')
  }
}

// ─── composizione del report ─────────────────────────────────────────────────

const oggi = new Date().toISOString().slice(0, 10)
const out = []
const tot = info.reduce((s, f) => s + f.righe, 0)

out.push('# MAPPA — indice generato di Mirafiori Web')
out.push('')
out.push(`> Generato da \`npm run mappa\` il ${oggi}. **Non modificare a mano**: le decisioni e le`)
out.push('> convenzioni stanno in `CLAUDE.md`, qui c\'è solo la fotografia dei file.')
out.push('')
out.push(`**${info.length} file · ${tot.toLocaleString('it-IT')} righe totali.**`)
out.push('')

// 1. file oltre soglia — solo codice applicativo (app/ e lib/): docs e script
// di migrazione una-tantum possono essere lunghi senza che sia un problema.
const grossi = info
  .filter((f) => (f.rel.startsWith('app/') || f.rel.startsWith('lib/')) && f.righe > SOGLIA_RIGHE)
  .sort((a, b) => b.righe - a.righe)
out.push(`## ⚠️ File oltre ${SOGLIA_RIGHE} righe — da spezzare`)
out.push('')
if (grossi.length === 0) {
  out.push('_Nessuno. 👍_')
} else {
  out.push('| File | Area | Righe | KB |')
  out.push('|---|---|---:|---:|')
  for (const f of grossi) {
    out.push(`| \`${f.rel}\` | ${areaDi.get(f.rel) ?? '—'} | ${f.righe} | ${f.kb} |`)
  }
}
out.push('')

// 2. aree
out.push('## Aree funzionali')
out.push('')
for (const area of AREE) {
  const files = perArea.get(area.nome).sort((a, b) => a.rel.localeCompare(b.rel))
  if (files.length === 0) continue
  const righeArea = files.reduce((s, f) => s + f.righe, 0)
  out.push(`### ${area.nome}`)
  out.push('')
  out.push(`_${files.length} file · ${righeArea} righe_`)
  out.push('')
  for (const f of files) {
    const allarme = f.righe > SOGLIA_RIGHE ? ' ⚠️' : ''
    if (f.isLib) {
      const ex = esporta(f.testo)
      const elenco = ex.length ? ` — esporta: ${ex.join(', ')}` : ''
      out.push(`- \`${f.rel}\` (${f.righe} righe)${allarme}${elenco}`)
    } else {
      out.push(`- \`${f.rel}\` (${f.righe} righe)${allarme}`)
    }
  }
  out.push('')
}

// 3. dipendenze
out.push('## Dipendenze fra moduli `lib/`')
out.push('')
out.push('Un modulo usato da **3 o più aree** è trasversale (🔴): toccarlo per una sola area rischia di')
out.push('rompere le altre, ed è il motivo per cui una modifica piccola diventa costosa. Sono questi i')
out.push('candidati da spezzare per area o da spostare in `lib/core/` (vedi `CLAUDE.md` § Convenzioni).')
out.push('')
out.push('| Modulo `lib/` | Aree che lo usano | N. file | Importato da |')
out.push('|---|---|---:|---|')
const ordinati = [...usatoDa.entries()].sort(
  (a, b) => b[1].aree.size - a[1].aree.size || b[1].file.size - a[1].file.size,
)
for (const [modulo, { file: chi, aree }] of ordinati) {
  const lista = [...chi].sort()
  const mostra = lista.length > 6 ? `${lista.slice(0, 6).join(', ')}, …` : lista.join(', ')
  const flag = aree.size >= 3 ? ' 🔴' : ''
  out.push(
    `| \`lib/${modulo}\`${flag} | ${[...aree].sort().join(' · ')} | ${lista.length} | ${mostra} |`,
  )
}
out.push('')

// 4. orfani
out.push('## File non mappati ad alcuna area')
out.push('')
if (orfani.length === 0) {
  out.push('_Nessuno: la mappa in `scripts/mappa.mjs` è completa._')
} else {
  out.push('Se qui compare qualcosa, è un\'area nuova (o rinominata): aggiungila all\'elenco `AREE`')
  out.push('in `scripts/mappa.mjs` e a `CLAUDE.md`.')
  out.push('')
  for (const f of orfani.sort((a, b) => a.rel.localeCompare(b.rel))) {
    out.push(`- \`${f.rel}\` (${f.righe} righe)`)
  }
}
out.push('')

writeFileSync(join(ROOT, 'MAPPA.md'), out.join('\n'), 'utf8')

console.log(`MAPPA.md aggiornata — ${info.length} file, ${tot} righe.`)
if (grossi.length) console.log(`⚠️  ${grossi.length} file oltre ${SOGLIA_RIGHE} righe: ${grossi.map((f) => f.rel).join(', ')}`)
if (orfani.length) console.log(`ℹ️  ${orfani.length} file non mappati (vedi in fondo a MAPPA.md).`)
