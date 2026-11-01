/**
 * Regole degli addebiti interni. Funzioni PURE: niente database, si provano da sole.
 */

import type { AltroCosto, DatiAddebito } from '@/types/servizi-interni'

const tondo = (n: number) => Math.round(n * 100) / 100

/** Ultimo giorno in cui un addebito del mese `mese` (YYYY-MM-01) si può ancora modificare. */
export const GIORNO_CHIUSURA = 10

/**
 * Un addebito si modifica fino al 10 del mese dopo; poi è fermo e si rettifica
 * nel mese seguente. Chi riceve deve poter contare su un numero che non cambia.
 */
export function bloccato(mese: string, oggi: Date = new Date()): boolean {
  const [a, m] = mese.split('-').map(Number)
  // Fine del giorno di chiusura, ora italiana approssimata a UTC+1: basta per un limite di giorni.
  const limite = Date.UTC(a, m, GIORNO_CHIUSURA, 23, 0, 0)
  return oggi.getTime() > limite
}

export function totaleAddebito(ore: number, euroOra: number | null, altri: AltroCosto[]): number | null {
  const extra = altri.reduce((s, c) => s + c.importo, 0)
  if (ore > 0 && euroOra == null) return null
  return tondo(ore * (euroOra ?? 0) + extra)
}

/** Forfait valido nel mese: la riga con `dal` più recente che non è dopo la fine del mese. */
export function forfaitDelMese(forfait: Array<{ dal: string; euroOra: number }>, mese: string): number | null {
  const [a, m] = mese.split('-').map(Number)
  const fine = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
  const validi = forfait.filter((f) => f.dal <= fine).sort((x, y) => y.dal.localeCompare(x.dal))
  return validi[0]?.euroOra ?? null
}

/** Controlla e ripulisce i dati di un addebito. Lancia un Error con un messaggio da mostrare. */
export function validaAddebito(d: Partial<DatiAddebito>): DatiAddebito {
  const testo = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const ccDa = testo(d.ccDa, 40).toLowerCase()
  const ccA = testo(d.ccA, 40).toLowerCase()
  if (!ccDa) throw new Error('Scegli il servizio che ha fatto il lavoro')
  if (!ccA) throw new Error('Scegli il servizio a cui addebitare')
  if (ccDa === ccA) throw new Error('Un servizio non può addebitare a se stesso')
  const mese = typeof d.mese === 'string' && /^\d{4}-\d{2}$/.test(d.mese.slice(0, 7)) ? `${d.mese.slice(0, 7)}-01` : ''
  if (!mese) throw new Error('Scegli il mese')
  const descrizione = testo(d.descrizione, 500)
  if (!descrizione) throw new Error('Scrivi cosa è stato fatto')
  const ore = typeof d.ore === 'number' && Number.isFinite(d.ore) ? tondo(d.ore) : 0
  if (ore < 0 || ore > 9999) throw new Error('Le ore non sono valide')
  const altriCosti = (Array.isArray(d.altriCosti) ? d.altriCosti : [])
    .map((c) => ({ descrizione: testo(c?.descrizione, 300), importo: typeof c?.importo === 'number' ? tondo(c.importo) : NaN }))
    .filter((c) => c.descrizione || Number.isFinite(c.importo))
  for (const c of altriCosti) {
    if (!c.descrizione) throw new Error('Ogni altro costo ha bisogno di dire cos\'è')
    if (!(c.importo > 0)) throw new Error(`L'importo di "${c.descrizione}" deve essere maggiore di zero`)
  }
  if (ore === 0 && altriCosti.length === 0) throw new Error('Metti le ore di lavoro o almeno un altro costo')
  return { ccDa, ccA, mese, descrizione, ore, altriCosti }
}

/** Ripartizione: controlla le quote prima di salvarle. */
export function validaQuote(quote: Array<{ ccCodice: string; percentuale: number }>, ccOrigine: string) {
  const pulite = quote
    .map((q) => ({ ccCodice: String(q.ccCodice).toLowerCase(), percentuale: Math.round(Number(q.percentuale) * 1000) / 1000 }))
    .filter((q) => q.percentuale > 0)
  if (pulite.some((q) => !Number.isFinite(q.percentuale) || q.percentuale > 100)) throw new Error('Una percentuale non è valida')
  if (pulite.some((q) => q.ccCodice === ccOrigine)) throw new Error(`${ccOrigine} non può ripartire su se stesso`)
  const somma = Math.round(pulite.reduce((s, q) => s + q.percentuale, 0) * 1000) / 1000
  if (Math.abs(somma - 100) > 0.01) throw new Error(`Le percentuali sommano a ${somma.toLocaleString('it-IT')}%: devono fare 100%`)
  return pulite
}
