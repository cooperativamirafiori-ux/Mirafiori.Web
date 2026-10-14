#!/usr/bin/env node
/**
 * Riporta in «da verificare» le scadenze chiuse IN AUTOMATICO solo perché in
 * fattura c'era scritto «contanti» (regola tolta il 13/10/2026, Dennis).
 *
 * Quali sono «in dubbio» (tutte le condizioni):
 *  - stato = pagata, modalità = contanti (MP01 dagli XML, «Contanti»/«cash» dall'Excel)
 *  - chiusa dall'import, non da una persona né dalla banca né dal gestionale:
 *      XML   → pagata_da = 'import fatture SDI'
 *      Excel → origine_pagamento = 'app' e pagata_il vuoto (le chiusure a mano lo valorizzano)
 *  - il fornitore NON è segnato «paga al momento» (per quelli vale ancora «pagata»)
 *
 * Uso (da web/):
 *   node scripts/riapri-contanti.mjs              → prova: conta e mostra, non scrive
 *   node scripts/riapri-contanti.mjs --dal 2026-01-01   → solo scadenze da quella data
 *   node scripts/riapri-contanti.mjs --applica    → scrive
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  for (const line of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* env già impostate */ }

const args = process.argv.slice(2)
const applica = args.includes('--applica')
const iDal = args.indexOf('--dal')
const dal = iDal >= 0 ? args[iDal + 1] : null

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

// Tutte le pagate con modalità contanti, a pagine da 1000.
const righe = []
for (let da = 0; ; da += 1000) {
  let q = db.from('scadenza')
    .select('id, data_scadenza, importo, modalita, pagata_da, pagata_il, origine_pagamento, segnalazione, fattura_passiva ( piva, fornitore, numero_fornitore )')
    .eq('stato', 'pagata')
    .or('modalita.eq.MP01,modalita.ilike.%contant%,modalita.ilike.%cash%')
    .order('data_scadenza')
    .range(da, da + 999)
  if (dal) q = q.gte('data_scadenza', dal)
  const { data, error } = await q
  if (error) { console.error('Lettura:', error.message); process.exit(1) }
  righe.push(...data)
  if (data.length < 1000) break
}

const { data: pam, error: e2 } = await db.from('fornitore').select('piva').eq('paga_al_momento', true)
if (e2) { console.error('Fornitori:', e2.message); process.exit(1) }
const pagaAlMomento = new Set(pam.map((f) => f.piva))

const auto = (r) =>
  r.pagata_da === 'import fatture SDI' ||
  (r.origine_pagamento === 'app' && !r.pagata_il)

const dubbie = righe.filter((r) => auto(r) && !pagaAlMomento.has(r.fattura_passiva?.piva))
const tenute = righe.length - dubbie.length

const perAnno = {}
for (const r of dubbie) {
  const a = r.data_scadenza.slice(0, 4)
  perAnno[a] ??= { n: 0, euro: 0 }
  perAnno[a].n++; perAnno[a].euro += Number(r.importo)
}
console.log(`Pagate con «contanti»: ${righe.length}${dal ? ` (dal ${dal})` : ''}`)
console.log(`  restano pagate (chiuse a mano/banca/gestionale o fornitore «paga al momento»): ${tenute}`)
console.log(`  in dubbio → da verificare: ${dubbie.length}`)
for (const [a, v] of Object.entries(perAnno).sort()) console.log(`    ${a}: ${v.n} scadenze, ${v.euro.toFixed(2)} €`)
console.log('\nUltime 15:')
for (const r of dubbie.slice(-15)) console.log(`  ${r.data_scadenza}  ${String(Number(r.importo).toFixed(2)).padStart(9)} €  ${r.fattura_passiva?.fornitore ?? '?'}  n. ${r.fattura_passiva?.numero_fornitore ?? '?'}`)

if (!applica) { console.log('\nProva: niente scritto. Per applicare aggiungi --applica'); process.exit(0) }

let fatte = 0
for (let i = 0; i < dubbie.length; i += 200) {
  const blocco = dubbie.slice(i, i + 200)
  const { error } = await db.from('scadenza')
    .update({ stato: 'da_verificare', motivo_verifica: 'senza_modalita', data_pagamento: null, pagata_da: null, pagata_il: null, origine_pagamento: null })
    .in('id', blocco.map((r) => r.id))
    .eq('stato', 'pagata')
  if (error) { console.error('Scrittura:', error.message); process.exit(1) }
  fatte += blocco.length
}
console.log(`\nRiportate in «da verificare»: ${fatte}`)
