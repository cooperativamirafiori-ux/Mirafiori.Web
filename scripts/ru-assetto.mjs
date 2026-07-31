#!/usr/bin/env node
/**
 * Commuta l'assetto dell'area Risorse Umane in .env.local, in modo sicuro.
 *
 * Perché uno script e non due righe di sed: le chiavi SP_LIST_DIPENDENTI e
 * SP_LIST_TIROCINI compaiono in ENTRAMBI gli assetti, e righe duplicate
 * verrebbero risolte in modo opposto dall'app (dotenv: vince l'ultima) e dagli
 * script di questa cartella (vince la prima). Metà app sulle liste nuove e
 * metà su quelle vecchie, su dati del personale, è un errore che non si nota
 * subito. Qui l'invariante "esattamente un assetto attivo" è verificata.
 *
 *   A = ATTUALE  liste sul sito gruppo_ControlloGestione, identità applicativa
 *   B = NUOVO    sito dedicato RisorseUmane, identità dell'utente (delegato)
 *
 * Uso (da web/):
 *   node scripts/ru-assetto.mjs             mostra l'assetto attivo
 *   node scripts/ru-assetto.mjs --nuovo     passa a B
 *   node scripts/ru-assetto.mjs --attuale   torna ad A
 *
 * Fa un backup .env.local.bak-<timestamp> prima di ogni modifica.
 * Dopo la commutazione va riavviato `npm run dev`: le env si leggono all'avvio.
 */

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV = join(__dirname, '..', '.env.local')

/** Chiavi di ciascun assetto, nell'ordine in cui appaiono nel file. */
const CHIAVI = {
  A: ['SP_LIST_DIPENDENTI', 'SP_LIST_TIROCINI'],
  B: ['SP_SITE_RU', 'SP_RU_DRIVE_ID', 'SP_RU_FOLDER', 'SP_LIST_DIPENDENTI', 'SP_LIST_TIROCINI'],
}

const MARCATORE_A = '# [A] ATTUALE'
const MARCATORE_B = '# [B] NUOVO'

function leggi() {
  try {
    return readFileSync(ENV, 'utf8').split('\n')
  } catch {
    console.error(`✗ ${ENV} non trovato.`)
    process.exit(1)
  }
}

/** Indici delle righe di ciascuna sezione, delimitate dai marcatori. */
function sezioni(righe) {
  const iA = righe.findIndex((r) => r.startsWith(MARCATORE_A))
  const iB = righe.findIndex((r) => r.startsWith(MARCATORE_B))
  const iFine = righe.findIndex((r, i) => i > iB && r.startsWith('# ====='))
  if (iA < 0 || iB < 0 || iFine < 0) {
    console.error(
      '✗ Blocco "Assetto area Risorse Umane" non riconosciuto in .env.local.\n' +
        '  Servono i marcatori "# [A] ATTUALE", "# [B] NUOVO" e la riga di chiusura "# ====".\n' +
        '  Sistemalo a mano o ripristina un backup .env.local.bak-*',
    )
    process.exit(1)
  }
  return { A: [iA + 1, iB], B: [iB + 1, iFine] }
}

const attiva = (r) => /^\s*[A-Z_]+\s*=/.test(r)
const eChiave = (r, chiavi) =>
  chiavi.some((k) => new RegExp(`^\\s*#?\\s*${k}\\s*=`).test(r))

function statoAssetto(righe, sez, quale) {
  const [da, a] = sez[quale]
  const pertinenti = righe.slice(da, a).filter((r) => eChiave(r, CHIAVI[quale]))
  const attive = pertinenti.filter(attiva)
  return { totali: pertinenti.length, attive: attive.length, righe: attive }
}

function mostra(righe, sez) {
  const a = statoAssetto(righe, sez, 'A')
  const b = statoAssetto(righe, sez, 'B')
  console.log(`  [A] ATTUALE (Controllo di Gestione, identità app)  → ${a.attive}/${a.totali} righe attive`)
  console.log(`  [B] NUOVO   (sito RU dedicato, identità utente)    → ${b.attive}/${b.totali} righe attive`)
  const attivo = a.attive > 0 && b.attive === 0 ? 'A' : b.attive > 0 && a.attive === 0 ? 'B' : null
  if (attivo) {
    console.log(`\n  ✓ Assetto attivo: ${attivo}`)
  } else {
    console.log('\n  ⚠ Stato incoerente: nessun assetto attivo, oppure entrambi.')
    console.log('    Commuta con --attuale o --nuovo per rimettere le cose in ordine.')
  }
  return attivo
}

function commuta(righe, sez, verso) {
  const altro = verso === 'B' ? 'A' : 'B'
  const fuori = []

  for (const quale of [verso, altro]) {
    const [da, a] = sez[quale]
    const abilita = quale === verso
    for (let i = da; i < a; i++) {
      const r = righe[i]
      if (!eChiave(r, CHIAVI[quale])) continue
      if (abilita) {
        righe[i] = r.replace(/^\s*#\s?/, '')
      } else if (attiva(r)) {
        righe[i] = `# ${r}`
      }
    }
  }

  // Nessuna chiave dell'assetto deve restare attiva fuori dal blocco:
  // sarebbe un duplicato invisibile.
  const dentro = new Set()
  for (const quale of ['A', 'B']) {
    for (let i = sez[quale][0]; i < sez[quale][1]; i++) dentro.add(i)
  }
  const tutteLeChiavi = [...new Set([...CHIAVI.A, ...CHIAVI.B])]
  righe.forEach((r, i) => {
    if (!dentro.has(i) && attiva(r) && eChiave(r, tutteLeChiavi)) fuori.push({ i, r })
  })

  return fuori
}

function main() {
  const arg = process.argv[2]
  const righe = leggi()
  const sez = sezioni(righe)

  if (!arg) {
    console.log('\nAssetto area Risorse Umane in .env.local:\n')
    mostra(righe, sez)
    console.log('\nPer commutare: node scripts/ru-assetto.mjs --nuovo | --attuale\n')
    return
  }

  const verso = arg === '--nuovo' ? 'B' : arg === '--attuale' ? 'A' : null
  if (!verso) {
    console.error(`✗ Argomento non riconosciuto: ${arg}\n  Usa --nuovo oppure --attuale.`)
    process.exit(1)
  }

  const backup = `${ENV}.bak-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`
  copyFileSync(ENV, backup)

  const fuori = commuta(righe, sez, verso)

  // Aggiorna l'intestazione, altrimenti resterebbe un commento che mente.
  const iTitolo = righe.findIndex((r) => r.startsWith('# Assetto area Risorse Umane'))
  if (iTitolo >= 0) righe[iTitolo] = `# Assetto area Risorse Umane  —  ATTIVO: ${verso}`

  writeFileSync(ENV, righe.join('\n'))

  console.log(`\n✓ Assetto commutato su ${verso === 'B' ? 'B (NUOVO — sito RU, delegato)' : 'A (ATTUALE — Controllo di Gestione, app)'}`)
  console.log(`  backup: ${backup.split('/').pop()}\n`)
  mostra(readFileSync(ENV, 'utf8').split('\n'), sez)

  if (fuori.length) {
    console.log('\n⚠ ATTENZIONE — chiavi attive FUORI dal blocco, quindi duplicate:')
    for (const { i, r } of fuori) console.log(`    riga ${i + 1}: ${r}`)
    console.log('  Commentale a mano: l’app e gli script le risolverebbero in modo diverso.')
  }

  console.log('\n→ Riavvia `npm run dev`: le variabili si leggono all’avvio.')
  if (verso === 'B') {
    console.log('→ Esci e rientra nell’app: serve un login nuovo per salvare il refresh token.\n')
  } else {
    console.log('')
  }
}

main()
