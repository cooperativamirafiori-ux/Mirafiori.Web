#!/usr/bin/env node
/**
 * Rigenera `public/comuni.json`: l'elenco dei comuni italiani con sigla della
 * provincia e CAP, che il modulo Richiesta Fattura usa per compilare da sé CAP
 * e provincia quando si sceglie il comune.
 *
 * Fonte: https://github.com/matteocontrini/comuni-json (dati ISTAT, licenza MIT).
 * I comuni cambiano di rado (fusioni, nuovi CAP): basta rilanciarlo una volta
 * l'anno, o quando qualcuno segnala un comune che manca.
 *
 *   node scripts/aggiorna-comuni.mjs
 *
 * Il file è compatto di proposito — una riga `[nome, sigla, [cap…]]` per comune,
 * circa 250 KB (65 KB compresso): lo scarica il telefono una volta sola, e la
 * ricerca poi lavora senza chiamare il server a ogni lettera.
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FONTE = 'https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json'
const DEST = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'comuni.json')

const res = await fetch(FONTE)
if (!res.ok) {
  console.error(`Download fallito: HTTP ${res.status}`)
  process.exit(1)
}
const comuni = await res.json()

const righe = comuni
  .map((c) => [c.nome, c.sigla, [...(c.cap ?? [])].sort()])
  .sort((a, b) => a[0].localeCompare(b[0], 'it'))

writeFileSync(DEST, JSON.stringify(righe))
console.log(`Scritti ${righe.length} comuni in public/comuni.json`)
