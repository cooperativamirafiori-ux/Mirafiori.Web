/**
 * Prova delle regole di abbinamento Qonto ↔ fatture e delle regole d'import dal
 * 1/11/2026, con dati inventati. Niente rete, niente database.
 *
 *   npx --yes tsx scripts/prova-abbina-qonto.ts
 *
 * Esce con codice 1 se un controllo fallisce. Regole: docs/riconciliazione-qonto.md.
 */

import { abbina, candidatiManuali, ccDaTesti, giaSuQonto, type MovimentoDaAbbinare, type ScadenzaCandidata } from '../lib/qonto/abbina'
import { scadenzeDa } from '../lib/pagamenti/sdi/regole'
import type { FatturaSdi } from '../lib/pagamenti/sdi/fattura'

let ko = 0
function ok(cond: boolean, cosa: string) {
  console.log(`${cond ? '✓' : '✗'} ${cosa}`)
  if (!cond) ko++
}

const mov = (x: Partial<MovimentoDaAbbinare> & { id: string; importo: number }): MovimentoDaAbbinare => ({
  data: '2026-11-05', ccCodice: null, tipo: 'card', controparte: null, controparteIban: null, etichetta: null, completato: true, ...x,
})
const scad = (x: Partial<ScadenzaCandidata> & { id: string; importo: number }): ScadenzaCandidata => ({
  fatturaId: `f-${x.id}`, piva: null, fornitore: null, dataRif: '2026-11-04', iban: null, ibanFornitore: null, ccIndicato: null, aperta: true, ...x,
})

// --- 1. Carta: stesso importo e nome → sicuro
{
  const r = abbina(
    [mov({ id: 'm1', importo: 42.5, controparte: 'Leroy Merlin', ccCodice: 'cc18' })],
    [scad({ id: 's1', importo: 42.5, fornitore: 'LEROY MERLIN ITALIA SRL', piva: '1' }), scad({ id: 's2', importo: 42.5, fornitore: 'Esselunga SpA', piva: '2' })],
    [],
  )
  ok(r.abbinamenti.length === 1 && r.abbinamenti[0].scadenzaIds[0] === 's1', 'carta Leroy Merlin → la fattura Leroy Merlin, non Esselunga')
}

// --- 2. Nome non riconosciuto (AMZN) → niente; poi impara
{
  const ms = [mov({ id: 'm1', importo: 50, controparte: 'AMZN Mktp IT', ccCodice: 'cc18' })]
  const cs = [scad({ id: 's1', importo: 50, fornitore: 'Amazon Business EU S.a.r.l', piva: 'AMZ' })]
  ok(abbina(ms, cs, []).abbinamenti.length === 0, 'AMZN Mktp IT non si riconosce dal nome: va a mano')
  ok(abbina(ms, cs, [{ chiave: 'nome:amzn mktp it', piva: 'AMZ', azione: 'fornitore' }]).abbinamenti.length === 1, '…ma dopo un abbinamento a mano sì')
  ok(candidatiManuali(ms[0], cs, []).length === 1, 'e a mano viene proposta (stesso importo)')
}

// --- 2b. Nome diverso ma stessa data (12/11/2026) → sicuro; data diversa → a mano
{
  const cs = [scad({ id: 's1', importo: 152.54, fornitore: 'GS S.p.A.', piva: 'GS', dataRif: '2026-11-10' })]
  const r = abbina([mov({ id: 'm1', importo: 152.54, controparte: 'Carrefour', ccCodice: 'cc7', data: '2026-11-10' })], cs, [])
  ok(r.abbinamenti.length === 1 && r.abbinamenti[0].perche === 'stesso importo e stessa data', 'Carrefour 152,54 del 10/11 → fattura GS S.p.A. del 10/11')
  ok(abbina([mov({ id: 'm1', importo: 152.54, controparte: 'Carrefour', data: '2026-11-11' })], cs, []).abbinamenti.length === 0, '…ma il giorno dopo no: a mano')
  ok(abbina([mov({ id: 'm1', importo: 152.54, controparte: 'Carrefour', data: '2026-11-10', completato: false })], cs, []).abbinamenti.length === 0, '…e finché è in attesa nemmeno')
  const due = [...cs, scad({ id: 's2', importo: 152.54, fornitore: 'Altro Srl', piva: 'X', dataRif: '2026-11-10' })]
  ok(abbina([mov({ id: 'm1', importo: 152.54, controparte: 'Carrefour', data: '2026-11-10' })], due, []).abbinamenti.length === 0, 'due fatture stesso importo e stessa data: a mano')
}

// --- 3. Amazon: due fatture da 50, il CC in fattura decide
{
  const cp = [{ chiave: 'nome:amazon', piva: 'AMZ', azione: 'fornitore' as const }]
  const ms = [mov({ id: 'm18', importo: 50, controparte: 'Amazon', ccCodice: 'cc18' }), mov({ id: 'm5', importo: 50, controparte: 'Amazon', ccCodice: 'cc5' })]
  const cs = [
    scad({ id: 'a', importo: 50, fornitore: 'Amazon EU', piva: 'AMZ', ccIndicato: 'cc5' }),
    scad({ id: 'b', importo: 50, fornitore: 'Amazon EU', piva: 'AMZ', ccIndicato: 'cc18' }),
  ]
  const r = abbina(ms, cs, cp)
  const di = (m: string) => r.abbinamenti.find((a) => a.movimentoId === m)?.scadenzaIds[0]
  ok(di('m18') === 'b' && di('m5') === 'a', 'Amazon: ogni carta prende la fattura col suo CC')
  const senzaCc = abbina(ms, cs.map((c) => ({ ...c, ccIndicato: null })), cp)
  ok(senzaCc.abbinamenti.length === 0, 'Amazon senza CC in fattura e due importi uguali: a mano')
  const sbagliato = abbina([ms[0]], [cs[0]], cp)
  ok(sbagliato.abbinamenti.length === 0, 'CC in fattura diverso dal sottoconto della carta: a mano')
}

// --- 4. Bonifico: IBAN
{
  const r = abbina(
    [mov({ id: 'm1', importo: 1200, tipo: 'transfer', controparte: 'Rossi Impianti', controparteIban: 'IT60 X054 2811 1010 0000 0123 456' })],
    [scad({ id: 's1', importo: 1200, fornitore: 'Idraulica Bianchi', piva: '9', iban: 'IT60X0542811101000000123456', dataRif: '2026-10-01' })],
    [],
  )
  ok(r.abbinamenti.length === 1, 'bonifico riconosciuto dall’IBAN anche col nome diverso')
}

// --- 5. Importo diverso di un centesimo → niente
{
  const r = abbina([mov({ id: 'm1', importo: 99.99, controparte: 'Leroy Merlin' })], [scad({ id: 's1', importo: 100, fornitore: 'Leroy Merlin' })], [])
  ok(r.abbinamenti.length === 0, 'un centesimo di differenza: niente')
}

// --- 6. Fuori finestra → niente
{
  const r = abbina([mov({ id: 'm1', importo: 10, controparte: 'Leroy Merlin', data: '2026-11-30' })], [scad({ id: 's1', importo: 10, fornitore: 'Leroy Merlin', dataRif: '2026-06-01' })], [])
  ok(r.abbinamenti.length === 0, 'fattura di giugno, movimento di fine novembre: niente')
}

// --- 7. Due movimenti uguali, una fattura → niente
{
  const r = abbina(
    [mov({ id: 'm1', importo: 20, controparte: 'Esselunga' }), mov({ id: 'm2', importo: 20, controparte: 'Esselunga', data: '2026-11-06' })],
    [scad({ id: 's1', importo: 20, fornitore: 'Esselunga SpA' })],
    [],
  )
  ok(r.abbinamenti.length === 0, 'due spese uguali e una fattura: a mano')
}

// --- 8. Cumulativo
{
  const iban = 'IT60X0542811101000000123456'
  const r = abbina(
    [mov({ id: 'm1', importo: 300, tipo: 'transfer', controparteIban: iban, controparte: 'Ditta' })],
    [scad({ id: 'a', importo: 100, iban }), scad({ id: 'b', importo: 200, iban }), scad({ id: 'c', importo: 75, iban })],
    [],
  )
  ok(r.abbinamenti.length === 1 && r.abbinamenti[0].come === 'cumulativo' && r.abbinamenti[0].scadenzaIds.sort().join() === 'a,b', 'bonifico cumulativo 100+200')
  const amb = abbina(
    [mov({ id: 'm1', importo: 300, tipo: 'transfer', controparteIban: iban })],
    [scad({ id: 'a', importo: 100, iban }), scad({ id: 'b', importo: 200, iban }), scad({ id: 'c', importo: 150, iban }), scad({ id: 'd', importo: 150, iban })],
    [],
  )
  ok(amb.abbinamenti.length === 0, 'cumulativo con due combinazioni possibili: a mano')
}

// --- 9. In attesa, solo a mano, ignora
{
  const cs = [scad({ id: 's1', importo: 5, fornitore: 'Leroy Merlin' })]
  ok(abbina([mov({ id: 'm1', importo: 5, controparte: 'Leroy Merlin', completato: false })], cs, []).abbinamenti.length === 0, 'movimento in attesa: non si abbina in automatico')
  ok(abbina([mov({ id: 'm1', importo: 5, controparte: 'Leroy Merlin', soloAMano: true })], cs, []).abbinamenti.length === 0, 'abbinamento annullato: resta solo a mano')
  const r = abbina([mov({ id: 'm1', importo: 1500, tipo: 'transfer', controparteIban: 'IT00A', controparte: 'Mario Rossi' })], [], [{ chiave: 'iban:IT00A', piva: '', azione: 'ignora' }])
  ok(r.ignorati[0] === 'm1', 'controparte da ignorare (stipendio)')
}

// --- 10. Prima dell'invio
{
  const c = scad({ id: 's1', importo: 80, fornitore: 'Ferramenta Verdi snc', piva: '7' })
  ok(giaSuQonto(c, [mov({ id: 'm1', importo: 80, tipo: 'transfer', controparte: 'Ferramenta Verdi', completato: false })], []) !== null, 'invio bloccato: c’è già un’uscita uguale (anche in attesa)')
  ok(giaSuQonto(c, [mov({ id: 'm1', importo: 81, controparte: 'Ferramenta Verdi' })], []) === null, 'importo diverso: l’invio parte')
}

// --- 11. CC dai testi
ok(ccDaTesti(['PO cc18 - Condominio']) === 'cc18', 'cc18 nella causale')
ok(ccDaTesti(['CC 5']) === 'cc5', 'CC 5')
ok(ccDaTesti(['c/c 12345', 'carta CC 123456']) === null, 'né c/c né numeri di carta')
ok(ccDaTesti(['cc18', 'cc5']) === null, 'due CC diversi: nessuno')

// --- 12. Regole d'import dal 1/11/2026
{
  const base: FatturaSdi = {
    nomeFile: 'x.xml', fornitore: 'Leroy Merlin', piva: '1', pivaPaese: 'IT', codiceFiscale: null, tipoDocumento: 'TD01',
    natura: 'fattura', numero: '1', data: '2026-11-03', divisa: 'EUR', totale: 50, imponibile: 41, iva: 9, ritenuta: 0,
    daPagare: 50, rate: [{ modalita: 'MP08', modalitaDescrizione: 'carta', famiglia: 'negozio', scadenza: '2026-11-03', importo: 50, iban: null, istituto: null }],
    causale: null, ccIndicato: null, descrizione: null, riferimenti: [], allegati: [], forniture: [], testoUtenze: '',
  }
  const ctx = { soglia: 1500, oggi: '2026-11-05', primoImport: false, fornitore: { pagaAlMomento: false, iban: null, ibanConfermato: false } }
  const carta = scadenzeDa(base, ctx)[0]
  ok(carta.stato === 'da_pagare' && carta.alert === 'pagata_senza_movimento' && !carta.pagata, 'carta dal 1/11: da pagare con l’avviso')
  const vecchia = scadenzeDa({ ...base, data: '2026-10-30' }, ctx)[0]
  ok(vecchia.stato === 'pagata' && vecchia.alert === null, 'carta di ottobre: pagata come prima')
  const contanti = scadenzeDa({ ...base, rate: [{ ...base.rate[0], modalita: 'MP01', famiglia: 'altro' }] }, ctx)[0]
  ok(contanti.stato === 'da_pagare' && contanti.alert === 'pagata_senza_movimento', 'contanti dal 1/11: come la carta')
  const contantiVecchi = scadenzeDa({ ...base, data: '2026-10-30', rate: [{ ...base.rate[0], modalita: 'MP01', famiglia: 'altro' }] }, ctx)[0]
  ok(contantiVecchi.stato === 'da_verificare', 'contanti di ottobre: da verificare come prima')
  const grande = scadenzeDa({ ...base, daPagare: 3000, rate: [{ ...base.rate[0], importo: 3000 }] }, ctx)[0]
  ok(grande.stato === 'da_pagare', 'carta sopra soglia: da pagare a Claudia, non in approvazione')
  const sdd = scadenzeDa({ ...base, rate: [{ ...base.rate[0], modalita: 'MP19', famiglia: 'automatica' }] }, ctx)[0]
  ok(sdd.stato === 'automatica', 'SDD dal 1/11: escono da sole come prima')
  const senza = scadenzeDa({ ...base, rate: [] }, { ...ctx, fornitore: { pagaAlMomento: true, iban: null, ibanConfermato: false } })[0]
  ok(senza.stato === 'da_pagare' && senza.alert === 'pagata_senza_movimento', 'fornitore «si paga al momento» dal 1/11: aspetta il movimento')
  const bonifico = scadenzeDa({ ...base, rate: [{ ...base.rate[0], modalita: 'MP05', famiglia: 'bonifico', iban: 'IT60X0542811101000000123456' }] }, ctx)[0]
  ok(bonifico.stato === 'da_pagare' && bonifico.alert === null, 'bonifico: in coda senza avviso')
}

console.log(ko ? `\n${ko} controlli falliti` : '\nTutti i controlli passati')
process.exit(ko ? 1 : 0)
