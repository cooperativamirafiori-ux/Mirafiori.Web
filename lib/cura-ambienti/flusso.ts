/**
 * Regole dei Lavori di Cura Ambienti: importi, stati, validazione.
 * Funzioni pure, nessun accesso ai dati.
 */

import type {
  DatiLavoro,
  ImportiLavoro,
  Lavoro,
  StatoLavoro,
  Tariffe,
} from '@/types/cura-ambienti'

const tondo = (n: number) => Math.round(n * 100) / 100

/**
 * Importo = ore per figura × tariffa + materiali.
 * Una figura con zero ore non ha bisogno della tariffa; con ore e senza
 * tariffa l'importo è null, mai una cifra inventata.
 */
export function importo(
  orePulizie: number,
  oreManutenzione: number,
  materiali: number,
  t: Tariffe,
): number | null {
  if (orePulizie > 0 && t.pulizie === null) return null
  if (oreManutenzione > 0 && t.manutenzione === null) return null
  return tondo(orePulizie * (t.pulizie ?? 0) + oreManutenzione * (t.manutenzione ?? 0) + materiali)
}

export function importiLavoro(l: Lavoro, t: Tariffe): ImportiLavoro {
  const preventivo = importo(l.prevOrePulizie, l.prevOreManutenzione, l.prevMateriali, t)
  const consuntivo =
    l.consOrePulizie === null || l.consOreManutenzione === null || l.consMateriali === null
      ? null
      : importo(l.consOrePulizie, l.consOreManutenzione, l.consMateriali, t)
  const scostamento = preventivo !== null && consuntivo !== null ? tondo(consuntivo - preventivo) : null
  return { preventivo, consuntivo, scostamento }
}

export const orePreventivo = (l: Lavoro) => l.prevOrePulizie + l.prevOreManutenzione
export const oreConsuntivo = (l: Lavoro) => (l.consOrePulizie ?? 0) + (l.consOreManutenzione ?? 0)

/**
 * Passaggi di stato consentiti dall'interfaccia. `addebitato` lo mette solo il
 * ribaltamento nel registro (passo 3), mai un bottone.
 */
const PASSAGGI: Record<StatoLavoro, StatoLavoro[]> = {
  bozza: ['preventivato', 'in_corso', 'annullato'],
  preventivato: ['bozza', 'in_corso', 'consuntivato', 'annullato'],
  in_corso: ['preventivato', 'consuntivato', 'annullato'],
  consuntivato: ['in_corso'],
  addebitato: [],
  annullato: ['bozza'],
}

export function passaggiDa(stato: StatoLavoro): StatoLavoro[] {
  return PASSAGGI[stato]
}

export function puoPassare(da: StatoLavoro, a: StatoLavoro): boolean {
  return PASSAGGI[da].includes(a)
}

/** Si modifica finché non è addebitato o annullato. */
export function modificabile(stato: StatoLavoro): boolean {
  return stato !== 'addebitato' && stato !== 'annullato'
}

/** Il consuntivo si chiude solo con ore e materiali scritti, anche a zero. */
export function consuntivoCompleto(l: Pick<Lavoro, 'consOrePulizie' | 'consOreManutenzione' | 'consMateriali'>): boolean {
  return l.consOrePulizie !== null && l.consOreManutenzione !== null && l.consMateriali !== null
}

export const meseValido = (m: unknown): m is string =>
  typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(m)

/** `YYYY-MM` o `YYYY-MM-DD` → `YYYY-MM-01`; null se non è un mese. */
export function normalizzaMese(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.match(/^(\d{4})-(0[1-9]|1[0-2])/)
  return m ? `${m[1]}-${m[2]}-01` : null
}

export function mesePrecedente(mese: string): string {
  const [a, m] = mese.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

const num = (v: unknown, def: number): number => {
  if (v === '' || v === null || v === undefined) return def
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}
const numONull = (v: unknown): number | null => (v === '' || v === null || v === undefined ? null : num(v, 0))
const testo = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}

/** Legge e controlla ciò che arriva dal modulo. Ritorna i dati o l'elenco dei problemi. */
export function leggiDati(b: Record<string, unknown>): { dati: DatiLavoro } | { problemi: string[] } {
  const problemi: string[] = []
  const mese = normalizzaMese(b.mese)
  if (!mese) problemi.push('Mese di competenza non valido')
  const destinatario = b.destinatario === 'esterno' ? 'esterno' : b.destinatario === 'struttura' ? 'struttura' : null
  if (!destinatario) problemi.push('Indica se il lavoro è per una struttura o per un cliente esterno')
  const strutturaCodice = testo(b.strutturaCodice)
  const cliente = testo(b.cliente)
  if (destinatario === 'struttura' && !strutturaCodice) problemi.push('Scegli la struttura')
  if (destinatario === 'esterno' && !cliente) problemi.push('Scrivi il nome del cliente')
  const titolo = testo(b.titolo)
  if (!titolo) problemi.push('Scrivi che lavoro è')

  const dati: DatiLavoro = {
    mese: mese ?? '',
    destinatario: destinatario ?? 'struttura',
    strutturaCodice: destinatario === 'struttura' ? strutturaCodice : null,
    cliente: destinatario === 'esterno' ? cliente : null,
    titolo: titolo ?? '',
    descrizione: testo(b.descrizione),
    ricorrente: b.ricorrente === true,
    prevOrePulizie: num(b.prevOrePulizie, 0),
    prevOreManutenzione: num(b.prevOreManutenzione, 0),
    prevMateriali: num(b.prevMateriali, 0),
    consOrePulizie: numONull(b.consOrePulizie),
    consOreManutenzione: numONull(b.consOreManutenzione),
    consMateriali: numONull(b.consMateriali),
    noteConsuntivo: testo(b.noteConsuntivo),
  }
  const numeri: Array<[string, number | null]> = [
    ['Ore pulizie (preventivo)', dati.prevOrePulizie],
    ['Ore manutenzione (preventivo)', dati.prevOreManutenzione],
    ['Materiali (preventivo)', dati.prevMateriali],
    ['Ore pulizie (consuntivo)', dati.consOrePulizie],
    ['Ore manutenzione (consuntivo)', dati.consOreManutenzione],
    ['Materiali (consuntivo)', dati.consMateriali],
  ]
  for (const [nome, v] of numeri) {
    if (v === null) continue
    if (!Number.isFinite(v) || v < 0) problemi.push(`${nome}: serve un numero, zero o più`)
    else if (nome.startsWith('Ore') && v > 2000) problemi.push(`${nome}: ${v} ore sembrano troppe`)
  }
  return problemi.length ? { problemi } : { dati }
}
