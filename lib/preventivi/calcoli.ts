/**
 * Preventivi — tutti i conti, come funzioni pure.
 *
 * Le usano sia il server (che fa fede) sia la schermata, che mostra i totali
 * mentre si scrive: un solo posto, così i due numeri non possono divergere.
 * Niente import da moduli con effetti (Graph, sessione): questo file finisce
 * anche nel bundle del browser.
 */

import {
  GRUPPI,
  REGIMI_IVA,
  SETTIMANE_MESE,
  type Ambito,
  type Modello,
  type RigaPreventivo,
  type Tariffa,
  type TotaliPreventivo,
} from '@/types/preventivi'

export const arrotonda = (n: number) => Math.round((Number(n) || 0) * 100) / 100

// ============================================================
// Date
// ============================================================

const ISO = /^\d{4}-\d{2}-\d{2}$/

export const isoValida = (d: unknown): d is string => typeof d === 'string' && ISO.test(d)

/** Oggi in ora italiana, YYYY-MM-DD. */
export function oggiIso(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
}

function aData(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const daData = (d: Date) => d.toISOString().slice(0, 10)

export function aggiungiGiorni(iso: string, giorni: number): string {
  const d = aData(iso)
  d.setUTCDate(d.getUTCDate() + giorni)
  return daData(d)
}

/**
 * Fine di un periodo di `mesi` mesi che parte da `dal`: il giorno prima dello
 * stesso giorno N mesi dopo (1/11 + 6 mesi → 30/04). È così che il Comune
 * scrive i progetti a sei mesi.
 */
export function finePeriodo(dal: string, mesi: number): string {
  const d = aData(dal)
  const giorno = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + mesi)
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  // Dal 31/01 per un mese: il 31/02 non c'è, il periodo arriva a fine febbraio.
  if (giorno > ultimo) {
    d.setUTCDate(ultimo)
    return daData(d)
  }
  d.setUTCDate(giorno)
  return aggiungiGiorni(daData(d), -1)
}

/** Mesi del periodo, arrotondati al mezzo mese (dal 1/11 al 30/04 = 6). */
export function mesiPeriodo(dal: string, al: string): number {
  if (!isoValida(dal) || !isoValida(al) || al < dal) return 0
  const a = aData(dal)
  const b = aData(aggiungiGiorni(al, 1))
  const mesi = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  const resto = (b.getUTCDate() - a.getUTCDate()) / 30
  return Math.max(0, Math.round((mesi + resto) * 2) / 2)
}

export function dataIt(iso: string | null | undefined): string {
  if (!iso || !isoValida(iso.slice(0, 10))) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ============================================================
// Righe e totali
// ============================================================

/** Quantità mensile della riga, ricavata dai campi che la descrivono. */
export function quantitaMensile(r: Pick<RigaPreventivo, 'unita' | 'quantita' | 'perSettimana' | 'accompagnamenti' | 'kmAccompagnamento'>): number {
  if (r.unita === 'km') {
    return arrotonda((Number(r.accompagnamenti) || 0) * (Number(r.kmAccompagnamento) || 0))
  }
  if ((r.unita === 'ora' || r.unita === 'giorno') && r.perSettimana != null && r.perSettimana !== undefined) {
    return arrotonda((Number(r.perSettimana) || 0) * SETTIMANE_MESE)
  }
  return arrotonda(Number(r.quantita) || 0)
}

export const importoRiga = (r: RigaPreventivo) => arrotonda(r.prezzo * quantitaMensile(r))

export function totali(righe: RigaPreventivo[], dal: string, al: string): TotaliPreventivo {
  const perGruppo = new Map<string, number>()
  const imponibile = { iva5: 0, iva22: 0 }
  let esente = 0
  let fic = 0
  for (const r of righe) {
    const imp = importoRiga(r)
    perGruppo.set(r.gruppo, arrotonda((perGruppo.get(r.gruppo) ?? 0) + imp))
    if (r.iva === 'iva5') imponibile.iva5 = arrotonda(imponibile.iva5 + imp)
    else if (r.iva === 'iva22') imponibile.iva22 = arrotonda(imponibile.iva22 + imp)
    else if (r.iva === 'fic') fic = arrotonda(fic + imp)
    else esente = arrotonda(esente + imp)
  }
  const iva = arrotonda(
    (imponibile.iva5 * REGIMI_IVA.iva5.aliquota) / 100 + (imponibile.iva22 * REGIMI_IVA.iva22.aliquota) / 100,
  )
  const spese = arrotonda(imponibile.iva5 + imponibile.iva22 + esente)
  const mensileSenzaIva = arrotonda(spese + fic)
  const mensileIvato = arrotonda(spese + iva + fic)
  const mesi = mesiPeriodo(dal, al)
  const ordine = (g: string) => {
    const i = (GRUPPI as readonly string[]).indexOf(g)
    return i < 0 ? 999 : i
  }
  return {
    perGruppo: [...perGruppo.entries()]
      .map(([gruppo, importo]) => ({ gruppo, importo }))
      .sort((a, b) => ordine(a.gruppo) - ordine(b.gruppo)),
    imponibile,
    iva,
    esente,
    fic,
    spese,
    mensileIvato,
    mensileSenzaIva,
    mesi,
    periodo: arrotonda(mensileIvato * mesi),
  }
}

// ============================================================
// Tariffario
// ============================================================

export const tariffaValidaIl = (t: Pick<Tariffa, 'dal' | 'al'>, data: string) =>
  t.dal <= data && (!t.al || t.al >= data)

/** Le voci utilizzabili in un preventivo con quel modello e ambito, alla data. */
export function vociDisponibili(tariffe: Tariffa[], data: string, modello: Modello, ambito: string): Tariffa[] {
  return tariffe
    .filter((t) => tariffaValidaIl(t, data))
    .filter((t) => !t.modelli.length || t.modelli.includes(modello))
    .filter((t) => t.ambito === 'Tutti' || t.ambito === ambito || ambito === 'Tutti')
    .sort((a, b) => a.ordine - b.ordine || a.voce.localeCompare(b.voce, 'it'))
}

/** La tariffa di un codice valida alla data (con ambito specifico prima di "Tutti"). */
export function tariffaPerCodice(tariffe: Tariffa[], codice: string, data: string, ambito?: string): Tariffa | null {
  const candidate = tariffe.filter((t) => t.codice === codice && tariffaValidaIl(t, data))
  return candidate.find((t) => t.ambito === ambito) ?? candidate.find((t) => t.ambito === 'Tutti') ?? candidate[0] ?? null
}

/** Il prezzo è ammesso per quella tariffa? `libero` = chi vede tutto può uscire dai limiti. */
export function problemaPrezzo(t: Tariffa, prezzo: number, libero: boolean): string | null {
  if (!(prezzo >= 0)) return `«${t.voce}»: prezzo non valido`
  if (libero) return null
  if (t.bloccato) {
    return arrotonda(prezzo) === arrotonda(t.prezzo)
      ? null
      : `«${t.voce}»: il prezzo è fisso a ${euro(t.prezzo)}`
  }
  if (t.min != null && prezzo < t.min) return `«${t.voce}»: il prezzo minimo è ${euro(t.min)}`
  if (t.max != null && prezzo > t.max) return `«${t.voce}»: il prezzo massimo è ${euro(t.max)}`
  return null
}

/**
 * Riporta le righe ai prezzi del tariffario valido alla data: serve al rinnovo
 * (dopo un adeguamento ISTAT il rinnovo deve uscire col prezzo nuovo) e alle
 * bozze rimaste aperte a cavallo di un cambio.
 *
 * Una voce a prezzo libero tiene il suo prezzo se è ancora nei limiti; una
 * bloccata prende sempre quello del tariffario. Ritorna anche cosa è cambiato.
 */
export function allineaPrezzi(
  righe: RigaPreventivo[],
  tariffe: Tariffa[],
  data: string,
  ambito?: string,
): { righe: RigaPreventivo[]; cambiate: { voce: string; prima: number; dopo: number }[]; senzaTariffa: string[] } {
  const cambiate: { voce: string; prima: number; dopo: number }[] = []
  const senzaTariffa: string[] = []
  const nuove = righe.map((r) => {
    const t = tariffaPerCodice(tariffe, r.codice, data, ambito)
    if (!t) {
      senzaTariffa.push(r.voce)
      return r
    }
    let prezzo = r.prezzo
    if (t.bloccato || problemaPrezzo(t, r.prezzo, false)) prezzo = t.prezzo
    if (arrotonda(prezzo) !== arrotonda(r.prezzo)) cambiate.push({ voce: r.voce, prima: r.prezzo, dopo: prezzo })
    return { ...r, prezzo, voce: t.voce, gruppo: t.gruppo, unita: t.unita, iva: t.iva }
  })
  return { righe: nuove, cambiate, senzaTariffa }
}

/** Nuova riga a partire da una voce del tariffario. */
export function rigaDaTariffa(t: Tariffa, giorniRetta: number): RigaPreventivo {
  return {
    codice: t.codice,
    voce: t.voce,
    gruppo: t.gruppo,
    unita: t.unita,
    prezzo: t.prezzo,
    iva: t.iva,
    quantita: t.unita === 'giorno' && t.gruppo === 'Retta' ? giorniRetta : t.unita === 'mese' || t.unita === 'forfait' ? 1 : 0,
    perSettimana: null,
    ...(t.unita === 'km' ? { percorso: '', accompagnamenti: 0, kmAccompagnamento: 0 } : {}),
  }
}

// ============================================================
// Adeguamento ISTAT
// ============================================================

export interface VoceIstat {
  spItemId: string
  codice: string
  voce: string
  ambito: string
  prima: number
  dopo: number
  minDopo: number | null
  maxDopo: number | null
}

/**
 * Anteprima dell'adeguamento: per ogni voce scelta, valida alla data di
 * decorrenza, il prezzo nuovo (e i limiti) aumentati della percentuale.
 * Si applica chiudendo la riga vecchia il giorno prima e aprendone una nuova:
 * i preventivi già fatti conservano il prezzo con cui sono nati.
 */
export function anteprimaIstat(tariffe: Tariffa[], percentuale: number, dal: string, ids?: string[]): VoceIstat[] {
  const f = 1 + percentuale / 100
  return tariffe
    .filter((t) => tariffaValidaIl(t, dal) && t.dal < dal)
    .filter((t) => !ids || ids.includes(t.spItemId))
    .filter((t) => t.prezzo > 0 && t.unita !== 'km')
    .map((t) => ({
      spItemId: t.spItemId,
      codice: t.codice,
      voce: t.voce,
      ambito: t.ambito,
      prima: t.prezzo,
      dopo: arrotonda(t.prezzo * f),
      minDopo: t.min == null ? null : arrotonda(t.min * f),
      maxDopo: t.max == null ? null : arrotonda(t.max * f),
    }))
}

// ============================================================
// Formato
// ============================================================

export function euro(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

export function numero(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 })
}

/** Iniziali del beneficiario, per i nomi di file (mai il nome intero). */
export function iniziali(nome: string): string {
  return (nome || '')
    .split(/[\s']+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + '.')
    .join('')
}
