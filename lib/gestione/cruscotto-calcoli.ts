/**
 * Cruscotto del controllo di gestione — i conti, senza I/O.
 *
 * Funzione pura: riceve le righe grezze delle quattro fonti e restituisce il
 * cruscotto già calcolato. Sta separata da `cruscotto.ts` (che legge) perché è
 * la parte che si sbaglia: così si prova in sandbox con dati finti, e i dati di
 * esempio passano dagli stessi conti di quelli veri.
 *
 * Le fonti, finché il registro (`movimento`) è vuoto:
 *   - fatture passive arrivate come XML dallo SDI, imponibile (Supabase);
 *   - costi inseriti a mano: la porta c'è, ma oggi il cruscotto non la usa
 *     (`diretti` vuoto) — sarebbero doppioni delle fatture XML e non si sa se
 *     sono con o senza IVA;
 *   - fatture emesse da Richiesta fattura (SharePoint): il CC è un NOME, non un
 *     codice — scelta deliberata, vedi docs/richiesta-fattura.md — e qui si
 *     riconosce per nome;
 *   - ore di lavoro timbrate (Supabase).
 *
 * ⚠️ Un costo inserito a mano può essere anche una fattura arrivata da SDI: le
 * due fonti oggi non si parlano, e il cruscotto le somma. È il motivo per cui
 * restano due numeri distinti in ogni scheda invece di uno solo.
 */

import type { CentroCruscotto, DatiCruscotto, FornitoreTop, Mesi, RigaDettaglio } from '@/types/cruscotto'

export interface InputCruscotto {
  anno: number
  anni: number[]
  meseUltimo: number
  /** Se manca si ricava: il primo mese che ha una fattura o un'ora. */
  meseInizio?: number
  completo: boolean
  esempio?: boolean
  centri: Array<{ codice: string; nome: string; area: string | null; ordine: number }>
  fatture: Array<{
    cc_codice: string | null
    data: string
    mese: number
    fornitore: string | null
    numero: string | null
    importo: number | null
  }>
  ore: Array<{ cc_codice: string; mese: number; ore: number; persone: number }>
  diretti: Array<{ codice: string | null; data: string; chi: string; importo: number }>
  ricavi: Array<{ centroNome: string; data: string; chi: string; numero?: string; importo: number }>
  qonto: Array<{ codice: string; saldo: number | null }>
  budget?: Record<string, number>
  avvisi: string[]
}

const zeri = (): Mesi => Array.from({ length: 12 }, () => 0)
const tondo = (n: number) => Math.round(n * 100) / 100

/** Nome "pulito" per riconoscere un centro di costo scritto a mano. */
export function chiaveNome(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function mese(data: string): number {
  const m = Number(data.slice(5, 7))
  return m >= 1 && m <= 12 ? m : 0
}

function topFornitori(righe: Array<{ nome: string; importo: number }>, quanti: number): FornitoreTop[] {
  const m = new Map<string, FornitoreTop>()
  for (const r of righe) {
    const nome = r.nome.trim() || 'Senza nome'
    const k = chiaveNome(nome) || nome
    const f = m.get(k) ?? { nome, importo: 0, n: 0 }
    f.importo += r.importo
    f.n += 1
    m.set(k, f)
  }
  return Array.from(m.values())
    .map((f) => ({ ...f, importo: tondo(f.importo) }))
    .sort((a, b) => b.importo - a.importo)
    .slice(0, quanti)
}

export function costruisciCruscotto(i: InputCruscotto): DatiCruscotto {
  const centri = new Map<string, CentroCruscotto>()
  const fornitoriCc = new Map<string, Array<{ nome: string; importo: number }>>()
  const ultimeCc = new Map<string, RigaDettaglio[]>()

  for (const c of [...i.centri].sort((a, b) => a.ordine - b.ordine)) {
    if (c.codice === 'DA_ATTRIBUIRE') continue
    centri.set(c.codice, {
      codice: c.codice,
      nome: c.nome,
      area: c.area || 'Altro',
      costiFatture: 0,
      nFatture: 0,
      costiDiretti: 0,
      nDiretti: 0,
      ricavi: 0,
      nRicavi: 0,
      ore: 0,
      persone: 0,
      mensileCosti: zeri(),
      mensileRicavi: zeri(),
      mensileOre: zeri(),
      fornitori: [],
      ultime: [],
      saldoQonto: null,
      budget: i.budget?.[c.codice] ?? null,
    })
    fornitoriCc.set(c.codice, [])
    ultimeCc.set(c.codice, [])
  }

  // ---- fatture passive -------------------------------------------------
  const mensileTutte = zeri()
  const mensileAttribuite = zeri()
  let tutte = 0
  let nTutte = 0
  let attribuite = 0
  let nAttribuite = 0
  let daAttImporto = 0
  let daAttN = 0
  const daAttFornitori: Array<{ nome: string; importo: number }> = []

  for (const f of i.fatture) {
    // Una fattura senza importo (né totale né rate) si conta ma non si somma:
    // meglio un numero di documenti giusto che un totale inventato.
    const imp = f.importo ?? 0
    const m = f.mese >= 1 && f.mese <= 12 ? f.mese : mese(f.data)
    const c = f.cc_codice ? centri.get(f.cc_codice) : undefined
    nTutte += 1
    tutte += imp
    if (m) mensileTutte[m - 1] += imp

    if (c) {
      nAttribuite += 1
      attribuite += imp
      if (m) mensileAttribuite[m - 1] += imp
      c.costiFatture += imp
      c.nFatture += 1
      if (m) c.mensileCosti[m - 1] += imp
      fornitoriCc.get(c.codice)!.push({ nome: f.fornitore ?? '', importo: imp })
      ultimeCc.get(c.codice)!.push({
        data: f.data,
        chi: f.fornitore ?? 'Fornitore',
        numero: f.numero ?? undefined,
        importo: imp,
        fonte: 'fattura',
      })
    } else {
      daAttN += 1
      daAttImporto += imp
      daAttFornitori.push({ nome: f.fornitore ?? '', importo: imp })
    }
  }

  // ---- costi inseriti a mano -------------------------------------------
  for (const d of i.diretti) {
    const c = d.codice ? centri.get(d.codice) : undefined
    if (!c) continue
    const m = mese(d.data)
    c.costiDiretti += d.importo
    c.nDiretti += 1
    if (m) c.mensileCosti[m - 1] += d.importo
    fornitoriCc.get(c.codice)!.push({ nome: d.chi, importo: d.importo })
    ultimeCc.get(c.codice)!.push({ data: d.data, chi: d.chi, importo: d.importo, fonte: 'diretto' })
  }

  // ---- ricavi: il CC arriva per nome -----------------------------------
  const perNome = new Map<string, CentroCruscotto>()
  for (const c of centri.values()) perNome.set(chiaveNome(c.nome), c)
  let ricNoImp = 0
  let ricNoN = 0
  for (const r of i.ricavi) {
    const k = chiaveNome(r.centroNome)
    let c = perNome.get(k)
    if (!c && k) {
      for (const [nome, cc] of perNome) {
        if (nome && (k.includes(nome) || nome.includes(k))) {
          c = cc
          break
        }
      }
    }
    if (!c) {
      ricNoImp += r.importo
      ricNoN += 1
      continue
    }
    const m = mese(r.data)
    c.ricavi += r.importo
    c.nRicavi += 1
    if (m) c.mensileRicavi[m - 1] += r.importo
    ultimeCc.get(c.codice)!.push({ data: r.data, chi: r.chi, numero: r.numero, importo: r.importo, fonte: 'ricavo' })
  }

  // ---- ore -------------------------------------------------------------
  for (const o of i.ore) {
    const c = centri.get(o.cc_codice)
    if (!c || o.mese < 1 || o.mese > 12) continue
    c.ore += o.ore
    c.mensileOre[o.mese - 1] += o.ore
    // Le persone non si sommano fra i mesi: si tiene il mese più affollato.
    c.persone = Math.max(c.persone, o.persone)
  }

  for (const q of i.qonto) {
    const c = centri.get(q.codice)
    if (c) c.saldoQonto = q.saldo
  }

  for (const c of centri.values()) {
    c.costiFatture = tondo(c.costiFatture)
    c.costiDiretti = tondo(c.costiDiretti)
    c.ricavi = tondo(c.ricavi)
    c.ore = tondo(c.ore)
    c.mensileCosti = c.mensileCosti.map(tondo)
    c.mensileRicavi = c.mensileRicavi.map(tondo)
    c.fornitori = topFornitori(fornitoriCc.get(c.codice)!, 5)
    c.ultime = ultimeCc
      .get(c.codice)!
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 8)
  }

  // Da dove partono i grafici: con le sole fatture XML (da luglio 2026) un
  // gennaio a zero direbbe "non abbiamo speso niente", che è falso.
  const mesiConDati = [
    ...i.fatture.map((f) => f.mese),
    ...i.ore.map((o) => o.mese),
  ].filter((m) => m >= 1 && m <= i.meseUltimo)
  const meseInizio = i.meseInizio ?? (mesiConDati.length ? Math.min(...mesiConDati) : i.meseUltimo)

  return {
    anno: i.anno,
    anni: i.anni,
    meseInizio,
    meseUltimo: i.meseUltimo,
    esempio: Boolean(i.esempio),
    completo: i.completo,
    centri: Array.from(centri.values()),
    fatture: {
      tutte: tondo(tutte),
      nTutte,
      attribuite: tondo(attribuite),
      nAttribuite,
      mensileTutte: mensileTutte.map(tondo),
      mensileAttribuite: mensileAttribuite.map(tondo),
    },
    daAttribuire: { importo: tondo(daAttImporto), n: daAttN, fornitori: topFornitori(daAttFornitori, 6) },
    ricaviNonRiconosciuti: { importo: tondo(ricNoImp), n: ricNoN },
    avvisi: i.avvisi,
    generatoIl: new Date().toISOString(),
  }
}
