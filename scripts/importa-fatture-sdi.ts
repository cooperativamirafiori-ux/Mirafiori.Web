/**
 * Import delle fatture XML dalla cartella SharePoint, lanciato dal Mac.
 * Lo stesso codice del giro notturno (lib/pagamenti/sdi/import.ts).
 *
 * Uso (dalla cartella web/):
 *   npx --yes tsx scripts/importa-fatture-sdi.ts           # PROVA: non scrive, non sposta
 *   npx --yes tsx scripts/importa-fatture-sdi.ts --apply   # import vero
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

for (const line of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const APPLY = process.argv.includes('--apply')
const euro = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function main() {
  const { importaFattureSdi } = await import('../lib/pagamenti/sdi/import')
  const r = await importaFattureSdi({ utente: 'dennis.maseri@cooperativamirafiori.com (script)', budgetMs: 1_800_000, prova: !APPLY })

  const ETICHETTA: Record<string, string> = {
    nuova: 'nuova', raccordata: "c'era dall'Excel", raccordata_con_scadenze: "c'era dall'Excel CON scadenze (non toccata)", gia: 'già importata',
  }
  const ordine = ['da_verificare', 'da_approvare', 'da_pagare', 'automatica', 'pagata', 'stornata']
  const peso = (x: (typeof r.righe)[number]) => Math.min(...x.scadenze.map((s) => ordine.indexOf(s.stato)).concat(99))
  for (const x of [...r.righe].sort((a, b) => peso(a) - peso(b) || a.data.localeCompare(b.data))) {
    const sc = x.scadenze.map((s) => `${s.stato}${s.motivo ? `(${s.motivo})` : ''}${s.blocco ? ` ⛔${s.blocco}` : ''} ${s.data} ${euro(s.importo)}`).join(' + ') || '—'
    console.log(`${x.data}  ${x.fornitore.slice(0, 30).padEnd(30)} n.${x.numero.slice(0, 14).padEnd(14)} ${euro(x.importo).padStart(10)} €  [${ETICHETTA[x.esito]}]  ${sc}`)
  }
  console.log(`\n=== ${r.prova ? 'PROVA — NIENTE È STATO SCRITTO' : 'IMPORT ESEGUITO'} ===`)
  console.log(`primo import: ${r.primoImport ? 'sì (bonifici già scaduti → da verificare)' : 'no'}`)
  console.log(`file letti: ${r.fileLetti} · fatture: ${r.fatture} · nuove: ${r.nuove} · dall'Excel: ${r.raccordate} · già importate: ${r.giaImportate}`)
  console.log(`scadenze per stato: ${Object.entries(r.perStato).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  console.log(`bloccate (IBAN): ${r.bloccate} · scartate: ${r.scartate.length} · errori: ${r.errori.length} · rimasti: ${r.rimasti}`)
  for (const s of r.scartate) console.log(`  scartata: ${s.file} — ${s.motivo}`)
  for (const e of r.errori) console.log(`  ERRORE: ${e.file} — ${e.motivo}`)
  if (r.prova) console.log('\nSe va bene, rilancia con --apply.')
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
