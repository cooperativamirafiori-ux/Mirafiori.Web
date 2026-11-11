/**
 * Quali rifornimenti appartengono a quale fattura IP, e come si divide
 * l'imponibile fra i centri di costo. Funzioni pure.
 *
 * Regole (decise con Dennis l'11/11/2026, docs/carburante.md):
 *
 *  1. **Per numero.** Il file mensile riporta il numero della fattura su ogni
 *     rifornimento già fatturato: quelli sono della fattura, senza discussione.
 *  2. **Per data, se il numero non c'è.** IP fattura il 16 e a fine mese; il
 *     file di un mese scaricato prima della seconda fattura ha i rifornimenti
 *     dal 16 in poi "NON FATTURATA", senza numero. Per una fattura che non
 *     trova niente col suo numero si prendono i rifornimenti senza numero, non
 *     presi da altre fatture, con data fino a quella della fattura (e non più
 *     vecchi di 35 giorni). Si accettano solo se la somma è plausibile (fra il
 *     70% e il 115% dell'imponibile): altrimenti la fattura resta in attesa.
 *  3. **Le "SERVICE FEE"** (fatture piccole, nessun rifornimento) si dividono
 *     come i rifornimenti dello stesso mese.
 *  4. **Si divide l'imponibile della fattura in proporzione** a quanto ha
 *     speso ogni centro di costo nel file. Il file non sempre copre tutta la
 *     fattura (manca qualche rifornimento): la differenza si spalma nella
 *     stessa proporzione e la nota lo dice. I rifornimenti senza centro di
 *     costo vanno su DA_ATTRIBUIRE.
 */

export const DA_ATTRIBUIRE = 'DA_ATTRIBUIRE'

export interface FatturaCarburante {
  id: string
  numero: string | null
  data: string | null // ISO
  imponibile: number | null
  descrizione: string | null
}

export interface RifornimentoDaDividere {
  protocollo: string
  data: string // ISO
  cc: string | null
  imponibile: number
  numeroFattura: string | null
}

export interface Quota {
  cc: string
  importo: number
  rifornimenti: number
}

export interface Divisione {
  id: string
  stato: 'divisa' | 'in_attesa'
  /** Come sono stati trovati i rifornimenti. */
  modo: 'numero' | 'data' | 'mese' | null
  quote: Quota[]
  /** Rifornimenti presi dalla fattura (non per le fee, che non ne prendono). */
  protocolli: string[]
  /** Somma dei rifornimenti usati per la proporzione. */
  nelFile: number
  nota: string | null
}

const PLAUSIBILE_MIN = 0.7
const PLAUSIBILE_MAX = 1.15
const FINESTRA_GIORNI = 35

const centesimi = (n: number) => Math.round(n * 100)
const euro = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

export const eFee = (f: FatturaCarburante) => /\bfee\b|canone|commission/i.test(f.descrizione ?? '')

const giorni = (a: string, b: string) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000

/**
 * Divide `totale` (in euro, positivo) in proporzione ai pesi, al centesimo,
 * col metodo dei resti più grandi: la somma delle quote è esattamente il totale.
 */
export function dividiInProporzione(totale: number, pesi: Map<string, { peso: number; n: number }>): Quota[] {
  const voci = [...pesi.entries()].filter(([, v]) => v.peso > 0)
  const somma = voci.reduce((s, [, v]) => s + v.peso, 0)
  if (somma <= 0) return []
  const tot = centesimi(totale)
  const grezze = voci.map(([cc, v]) => {
    const esatta = (tot * v.peso) / somma
    return { cc, n: v.n, base: Math.floor(esatta), resto: esatta - Math.floor(esatta) }
  })
  let mancano = tot - grezze.reduce((s, g) => s + g.base, 0)
  for (const g of [...grezze].sort((a, b) => b.resto - a.resto || a.cc.localeCompare(b.cc))) {
    if (mancano <= 0) break
    g.base++
    mancano--
  }
  return grezze
    .map((g) => ({ cc: g.cc, importo: g.base / 100, rifornimenti: g.n }))
    .filter((q) => q.importo !== 0)
    .sort((a, b) => b.importo - a.importo || a.cc.localeCompare(b.cc))
}

function pesiDi(righe: RifornimentoDaDividere[]) {
  const pesi = new Map<string, { peso: number; n: number }>()
  for (const r of righe) {
    const cc = r.cc ?? DA_ATTRIBUIRE
    const p = pesi.get(cc) ?? { peso: 0, n: 0 }
    p.peso += r.imponibile
    p.n++
    pesi.set(cc, p)
  }
  return pesi
}

function divisa(
  f: FatturaCarburante,
  righe: RifornimentoDaDividere[],
  modo: Divisione['modo'],
  prende: boolean,
): Divisione {
  const totale = Math.abs(f.imponibile ?? 0)
  const nelFile = centesimi(righe.reduce((s, r) => s + r.imponibile, 0)) / 100
  const quote = dividiInProporzione(totale, pesiDi(righe))
  if (!quote.length) {
    return { id: f.id, stato: 'in_attesa', modo: null, quote: [], protocolli: [], nelFile, nota: 'I rifornimenti trovati non hanno importo.' }
  }
  let nota: string | null = null
  if (modo === 'mese') {
    nota = `Divisa come i rifornimenti del mese (${righe.length}, ${euro(nelFile)}).`
  } else {
    const diff = centesimi(totale - nelFile) / 100
    const quanti = `${righe.length} ${righe.length === 1 ? 'rifornimento' : 'rifornimenti'}`
    const come = modo === 'data' ? ' trovati per data (nel file non avevano ancora il numero)' : ''
    nota =
      Math.abs(diff) < 0.01
        ? `${quanti}${come}: tornano al centesimo.`
        : `${quanti}${come} per ${euro(nelFile)} su ${euro(totale)} di fattura: la differenza (${euro(diff)}) è divisa nella stessa proporzione.`
  }
  return {
    id: f.id,
    stato: 'divisa',
    modo,
    quote,
    protocolli: prende ? righe.map((r) => r.protocollo) : [],
    nelFile,
    nota,
  }
}

const inAttesa = (id: string, nota: string): Divisione => ({
  id,
  stato: 'in_attesa',
  modo: null,
  quote: [],
  protocolli: [],
  nelFile: 0,
  nota,
})

/** Abbina e divide tutte le fatture carburante in un colpo, dalla più vecchia. */
export function dividiFatture(fatture: FatturaCarburante[], rifornimenti: RifornimentoDaDividere[]): Divisione[] {
  const ordinate = [...fatture].sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '') || a.id.localeCompare(b.id))
  const carburante = ordinate.filter((f) => !eFee(f))
  const fee = ordinate.filter(eFee)
  const numeri = new Set(carburante.map((f) => f.numero).filter((n): n is string => !!n))
  const presi = new Set<string>()
  const esiti = new Map<string, Divisione>()

  // 1. per numero
  const perNumero = new Map<string, RifornimentoDaDividere[]>()
  for (const r of rifornimenti) {
    if (r.numeroFattura && numeri.has(r.numeroFattura)) {
      const l = perNumero.get(r.numeroFattura) ?? []
      l.push(r)
      perNumero.set(r.numeroFattura, l)
    }
  }
  for (const f of carburante) {
    if (f.imponibile === null) {
      esiti.set(f.id, inAttesa(f.id, 'La fattura non ha l\'imponibile: non si può dividere.'))
      continue
    }
    const righe = f.numero ? perNumero.get(f.numero) : undefined
    if (righe?.length) {
      righe.forEach((r) => presi.add(r.protocollo))
      esiti.set(f.id, divisa(f, righe, 'numero', true))
    }
  }

  // 2. per data, per quelle rimaste senza
  for (const f of carburante) {
    if (esiti.has(f.id)) continue
    if (!f.data) {
      esiti.set(f.id, inAttesa(f.id, 'La fattura non ha la data.'))
      continue
    }
    const righe = rifornimenti.filter(
      (r) =>
        !r.numeroFattura &&
        !presi.has(r.protocollo) &&
        r.data <= f.data! &&
        giorni(f.data!, r.data) <= FINESTRA_GIORNI,
    )
    const somma = righe.reduce((s, r) => s + r.imponibile, 0)
    const totale = Math.abs(f.imponibile ?? 0)
    if (!righe.length) {
      esiti.set(f.id, inAttesa(f.id, 'Nei file caricati non ci sono ancora i rifornimenti di questa fattura.'))
      continue
    }
    if (somma < totale * PLAUSIBILE_MIN || somma > totale * PLAUSIBILE_MAX) {
      esiti.set(
        f.id,
        inAttesa(
          f.id,
          `Senza numero di fattura ci sono ${righe.length} rifornimenti per ${euro(somma)}, ma la fattura è di ${euro(totale)}: non tornano, si aspetta il file giusto.`,
        ),
      )
      continue
    }
    righe.forEach((r) => presi.add(r.protocollo))
    esiti.set(f.id, divisa(f, righe, 'data', true))
  }

  // 3. le fee, come il mese
  for (const f of fee) {
    if (f.imponibile === null || !f.data) {
      esiti.set(f.id, inAttesa(f.id, 'La fattura non ha imponibile o data.'))
      continue
    }
    const mese = f.data.slice(0, 7)
    const righe = rifornimenti.filter((r) => r.data.slice(0, 7) === mese)
    esiti.set(
      f.id,
      righe.length ? divisa(f, righe, 'mese', false) : inAttesa(f.id, 'Nessun rifornimento del mese nei file caricati.'),
    )
  }

  return fatture.map((f) => esiti.get(f.id)!)
}
