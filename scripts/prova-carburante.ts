/**
 * Prova di sola lettura dei file delle carte carburante: nessun database,
 * nessuna SharePoint. Utile quando il portale IP cambia tracciato.
 *
 *   npx --yes tsx scripts/prova-carburante.ts ~/Downloads/2026_10.xls [altri file…]
 *
 * Stampa, file per file: rifornimenti letti, avvisi (centri di costo non
 * riconosciuti, colonne mancanti) e totale imponibile per numero di fattura —
 * da confrontare con l'imponibile delle fatture IP.
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { rifornimentiDaFile } from '../lib/carburante/lettura'

// Elenco fisso dei centri di costo (lo specchio vero sta su Supabase).
const CENTRI = [
  ['cc1', 'Scat.to Orientamento lavoro'], ['cc2', 'La Locanda nel Parco'], ['cc3', 'Una Serra per Mirafiori'],
  ['cc4', 'CAV In Rete'], ['cc5', 'Casa Artemisia'], ['cc6', 'Toc Toc Roberto'], ['cc7', 'CPG Torino'],
  ['cc8', 'MirArte'], ['cc9', 'CRP CO.S.MI.C.A'], ['cc10', 'Salute Mentale ASL TO'],
  ['cc11', 'Educativa Sanitaria ASL TO5'], ['cc12', 'Interventi CDSR Fondazione OZ'], ['cc13', 'Progetto Ponte'],
  ['cc14', 'CER Giulia'], ['cc15', 'Ed. amb. Nord'], ['cc16', 'Ed. amb. Sud'], ['cc17', 'SCAT.TO abitare'],
  ['cc18', 'Condominio Solidale'], ['cc19', 'Care Leavers'], ['cc20', 'CISA 12 Nichelino'],
  ['cc21', 'Pian della Mussa'], ['cc22', 'Amazing'], ['cc23', 'Progettazione - Amministrazione'],
  ['cc24', 'Cura Ambienti'],
].map(([codice, nome]) => ({ codice, nome }))

const file = process.argv.slice(2)
if (!file.length) {
  console.error('Uso: npx --yes tsx scripts/prova-carburante.ts <file.xls> [altri…]')
  process.exit(1)
}

for (const percorso of file) {
  const nome = basename(percorso)
  const r = rifornimentiDaFile(new Uint8Array(readFileSync(percorso)), nome, CENTRI)
  console.log(`\n== ${nome}: ${r.scartato ? 'SCARTATO' : `${r.rifornimenti.length} rifornimenti`}`)
  for (const a of r.avvisi) console.log(`   ! ${a}`)
  const perFattura = new Map<string, { n: number; tot: number; cc: Map<string, number> }>()
  for (const x of r.rifornimenti) {
    const k = x.numeroFattura ?? '(senza numero)'
    const v = perFattura.get(k) ?? { n: 0, tot: 0, cc: new Map() }
    v.n++
    v.tot += x.imponibile
    v.cc.set(x.cc ?? `?${x.ccFile ?? ''}`, (v.cc.get(x.cc ?? `?${x.ccFile ?? ''}`) ?? 0) + x.imponibile)
    perFattura.set(k, v)
  }
  for (const [k, v] of perFattura) {
    const cc = [...v.cc].map(([c, t]) => `${c} ${t.toFixed(2)}`).join(' · ')
    console.log(`   ${k}: ${v.n} rif., ${v.tot.toFixed(2)} € — ${cc}`)
  }
}
