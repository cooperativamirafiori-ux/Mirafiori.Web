/**
 * Prova della compilazione del mese da orario teorico, senza database.
 *
 * Mette al posto di Supabase un finto client in memoria e fa girare davvero
 * `compilaMeseDaProfilo`, `creaTimbratura` e `creaAssenzaPeriodo`: quello che si
 * verifica sono le regole (cosa salta, cosa sostituisce, cosa non tocca), che
 * sono la parte in cui si sbaglia. La conversazione col database la garantisce
 * il vincolo sulle tabelle, non un test.
 *
 * Uso:  node scripts/prova-da-profilo.mjs
 *
 * Nessuna variabile d'ambiente, nessuna rete: si può lanciare ovunque.
 */

import { createRequire } from 'node:module'
import Module from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const QUI = path.dirname(fileURLToPath(import.meta.url))
const RADICE = path.resolve(QUI, '..')
const require = createRequire(import.meta.url)

// --- far girare i .ts e capire gli import "@/..." ---------------------------
require(path.join(RADICE, 'node_modules/sucrase/register/ts'))

const risolviOriginale = Module._resolveFilename
Module._resolveFilename = function (richiesta, ...resto) {
  if (richiesta.startsWith('@/')) {
    return risolviOriginale.call(this, path.join(RADICE, richiesta.slice(2)), ...resto)
  }
  return risolviOriginale.call(this, richiesta, ...resto)
}

// ============================================================ finto Supabase
// Tre tabelle in memoria e un builder che capisce le catene usate dal modulo
// (select/insert/delete + eq/gte/lte/in/order/limit/single/maybeSingle).

const db = { dipendente: [], profilo_orario: [], profilo_fascia: [], servizio: [], timbratura: [], chiusura_mese: [] }
let seqTimbratura = 1

const DENTRO = {
  eq: (v, x) => String(v) === String(x),
  gte: (v, x) => v >= x,
  lte: (v, x) => v <= x,
}

function query(tabella) {
  const filtri = []
  let modo = 'select'
  let daInserire = null
  let ordine = null

  const risultato = () => {
    let righe = db[tabella].filter((r) => filtri.every(([op, col, val]) => DENTRO[op](r[col], val)))
    if (ordine) {
      righe = [...righe].sort((a, b) => {
        const [c, asc] = ordine
        const x = a[c] ?? '', y = b[c] ?? ''
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
      })
    }
    if (modo === 'delete') {
      db[tabella] = db[tabella].filter((r) => !righe.includes(r))
      return righe
    }
    if (modo === 'insert') {
      const nuove = (Array.isArray(daInserire) ? daInserire : [daInserire]).map((r) => ({
        id: tabella === 'timbratura' ? `t${seqTimbratura++}` : db[tabella].length + 1,
        ...r,
      }))
      db[tabella].push(...nuove)
      return nuove
    }
    return righe.map(espandi(tabella))
  }

  const api = {
    select() { return api },
    insert(r) { modo = 'insert'; daInserire = r; return api },
    delete() { modo = 'delete'; return api },
    eq(c, v) { filtri.push(['eq', c, v]); return api },
    gte(c, v) { filtri.push(['gte', c, v]); return api },
    lte(c, v) { filtri.push(['lte', c, v]); return api },
    in(c, vs) { filtri.push(['eq', c, vs[0]]); return api },
    order(c, o) { ordine = [c, o?.ascending !== false]; return api },
    limit() { return api },
    single() { return Promise.resolve({ data: risultato()[0] ?? null, error: null }) },
    maybeSingle() { return Promise.resolve({ data: risultato()[0] ?? null, error: null }) },
    then(ok, ko) { return Promise.resolve({ data: risultato(), error: null }).then(ok, ko) },
  }
  return api
}

/** Le join che il modulo si aspetta dentro le righe lette. */
const espandi = (tabella) => (r) => {
  if (tabella === 'profilo_orario') {
    return {
      ...r,
      fasce: db.profilo_fascia
        .filter((f) => f.profilo_id === r.id)
        .map((f) => ({ ...f, servizio: db.servizio.find((s) => s.id === f.servizio_id) })),
    }
  }
  if (tabella === 'timbratura') {
    return { ...r, servizio: db.servizio.find((s) => s.id === r.servizio_id) }
  }
  return r
}

require.cache[require.resolve(path.join(RADICE, 'lib/core/supabase.ts'))] = {
  id: 'finto-supabase', filename: 'finto-supabase', loaded: true,
  exports: { supabase: () => ({ from: query }) },
}

// ================================================================== scenario
const { compilaMeseDaProfilo } = require(path.join(RADICE, 'lib/timbrature/da-profilo.ts'))
const { creaTimbratura, listTimbrature } = require(path.join(RADICE, 'lib/timbrature/righe.ts'))
const { creaAssenzaPeriodo } = require(path.join(RADICE, 'lib/timbrature/assenze.ts'))

db.dipendente.push({ id: 1, email: 'resp@x.it', cognome_nome: 'Rossi Anna', attivo: true, non_timbra: true })
db.dipendente.push({ id: 2, email: 'op@x.it', cognome_nome: 'Bianchi Ugo', attivo: true, non_timbra: false })
db.servizio.push({ id: 10, nome: 'UFFICIO', centro_costo: 1, tipo_voce: 'lavoro', attivo: true, ordine: 10, ad_ore: false, chiede_progetto: false })
db.servizio.push({ id: 99, nome: 'Ferie', centro_costo: 99, tipo_voce: 'giustificativo', attivo: true, ordine: 91, ad_ore: true, chiede_progetto: false })

// Orario teorico: lun-ven 9-13 e 14-18 (8 h), niente sabato e domenica.
db.profilo_orario.push({
  id: 1, dipendente_id: 1, decorrenza: '2026-01-01',
  ore_lun: 8, ore_mar: 8, ore_mer: 8, ore_gio: 8, ore_ven: 8, ore_sab: 0, ore_dom: 0,
  aggiornato_il: '2026-01-01T00:00:00Z',
})
for (let g = 1; g <= 5; g++) {
  db.profilo_fascia.push({ id: g * 2 - 1, profilo_id: 1, giorno: g, ora_inizio: '09:00', ora_fine: '13:00', servizio_id: 10 })
  db.profilo_fascia.push({ id: g * 2, profilo_id: 1, giorno: g, ora_inizio: '14:00', ora_fine: '18:00', servizio_id: 10 })
}

let falliti = 0
const ok = (etichetta, atteso, avuto) => {
  const bene = JSON.stringify(atteso) === JSON.stringify(avuto)
  if (!bene) falliti++
  console.log(`${bene ? '  ✓' : '  ✗'} ${etichetta}${bene ? '' : `\n      atteso ${JSON.stringify(atteso)}, avuto ${JSON.stringify(avuto)}`}`)
}

async function main() {
  // Settembre 2026: 22 giorni feriali, ma l'8 e' gia' occupato da ferie messe
  // prima, e il 1° gennaio... no: qui il festivo del mese e' nessuno.
  console.log('\n▶ Ferie inserite PRIMA di compilare')
  await creaAssenzaPeriodo(1, 99, '2026-09-07', '2026-09-11', 'hr@x.it', { perConto: true })
  let e = await compilaMeseDaProfilo(1, 2026, 9, 'hr@x.it', { perConto: true })
  ok('le 5 giornate di ferie non vengono toccate', 5, e.giaCompilati.length)
  ok('compilate le altre 17 feriali', 17, e.compilate.length)
  ok('due righe per giornata (pausa pranzo)', 34, e.righe)

  console.log('\n▶ Ripremere il bottone non cambia niente')
  e = await compilaMeseDaProfilo(1, 2026, 9, 'hr@x.it', { perConto: true })
  ok('nessuna riga nuova', 0, e.righe)
  ok('tutte le feriali risultano gia\' fatte', 22, e.giaCompilati.length)

  console.log('\n▶ Mutua comunicata dopo: scavalca la giornata teorica')
  const prima = (await listTimbrature(1, '2026-09-15', '2026-09-15')).length
  await creaTimbratura(1, { data: '2026-09-15', servizioId: 99 }, 'resp@x.it', { perConto: true })
  const dopo = await listTimbrature(1, '2026-09-15', '2026-09-15')
  ok('la giornata teorica aveva 2 righe', 2, prima)
  ok('resta solo il giustificativo', 1, dopo.length)
  ok('ed e\' il giustificativo', 'giustificativo', dopo[0].tipoVoce)

  console.log('\n▶ Rigenera: rifa\' il teorico e lascia stare il resto')
  e = await compilaMeseDaProfilo(1, 2026, 9, 'hr@x.it', { rigenera: true, perConto: true })
  const q = await listTimbrature(1, '2026-09-01', '2026-09-30')
  ok('rimosse le righe teoriche', 32, e.rimosse)
  ok('ferie ancora al loro posto', 5, q.filter((t) => t.tipoVoce === 'giustificativo' && t.data <= '2026-09-11').length)
  ok('la mutua del 15 non e\' stata sovrascritta', 1, q.filter((t) => t.data === '2026-09-15').length)

  console.log('\n▶ Chi timbra non passa da qui')
  try {
    await compilaMeseDaProfilo(2, 2026, 9, 'hr@x.it', { perConto: true })
    ok('doveva rifiutare', true, false)
  } catch (err) {
    ok('rifiutato con un messaggio che dice cosa fare', true, /Non timbra/.test(err.message))
  }

  console.log(falliti ? `\n✗ ${falliti} controlli falliti\n` : '\n✓ Tutto a posto\n')
  process.exit(falliti ? 1 : 0)
}

main().catch((e) => { console.error('ERRORE:', e); process.exit(1) })
