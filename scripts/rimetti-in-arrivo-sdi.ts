/**
 * Rimette in "fatture da SDI" dei file finiti in "Importate", per rifarne
 * l'import. Nomi esatti (maiuscole comprese).
 *
 * Uso (dalla cartella web/):
 *   npx --yes tsx scripts/rimetti-in-arrivo-sdi.ts "nome1.xml.p7m" "nome1_MT_001.xml"
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

for (const line of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

async function main() {
  const nomi = process.argv.slice(2)
  if (!nomi.length) throw new Error('Indica almeno un nome di file')
  const { rimettiInArrivo } = await import('../lib/pagamenti/sdi/cartella')
  const fatti = await rimettiInArrivo(nomi)
  for (const n of nomi) console.log(fatti.includes(n) ? `✓ rimesso in arrivo: ${n}` : `✗ non trovato in Importate: ${n}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
