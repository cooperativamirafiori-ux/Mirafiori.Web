/**
 * Regole dei Lavori di Cura Ambienti: importi, stati, validazione.
 * Funzioni pure, nessun accesso ai dati.
 */

import type {
  DatiLavoro,
  Frequenza,
  ImportiLavoro,
  Lavoro,
  StatoLavoro,
  Tariffe,
  TariffeStrutture,
} from '@/types/cura-ambienti'

import { bloccato, primoMeseAperto } from '@/lib/servizi-interni/flusso'

const tondo = (n: number) => Math.round(n * 100) / 100

/**
 * Il mese in cui si addebita un Lavoro consuntivato: il suo, se quando è stato
 * consuntivato era ancora aperto; altrimenti il primo mese aperto in quel momento.
 * Si ricava da `consuntivatoIl`, quindi non cambia col passare dei giorni.
 */
export function meseAddebitoLavoro(l: Pick<Lavoro, 'mese' | 'consuntivatoIl'>): string {
  const quando = l.consuntivatoIl ? new Date(l.consuntivatoIl) : new Date()
  return bloccato(l.mese, quando) ? primoMeseAperto(quando) : l.mese
}

/** Un Lavoro consuntivato per una struttura il cui mese di addebito è chiuso: è fermo, non si tocca più. */
export function lavoroFermo(l: Lavoro, oggi: Date = new Date()): boolean {
  return (
    l.stato === 'addebitato' ||
    (l.stato === 'consuntivato' && l.destinatario === 'struttura' && bloccato(meseAddebitoLavoro(l), oggi))
  )
}

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
  oreSostituzione = 0,
): number | null {
  if (orePulizie > 0 && t.pulizie === null) return null
  if (oreManutenzione > 0 && t.manutenzione === null) return null
  if (oreSostituzione > 0 && t.sostituzione === null) return null
  return tondo(
    orePulizie * (t.pulizie ?? 0) + oreManutenzione * (t.manutenzione ?? 0) + oreSostituzione * (t.sostituzione ?? 0) + materiali,
  )
}

/**
 * Le righe dell'addebito di un Lavoro consuntivato: una per figura con ore,
 * più i materiali. null se manca una tariffa che serve (allora non si addebita).
 */
export function righeAddebito(l: Lavoro, t: Tariffe): Array<{ descrizione: string; importo: number }> | null {
  if (l.consOrePulizie === null || l.consOreManutenzione === null || l.consMateriali === null) return null
  const v = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 2 })
  const e = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const righe: Array<{ descrizione: string; importo: number }> = []
  const figure: Array<[number, number | null, string]> = [
    [l.consOrePulizie, t.pulizie, 'pulizie'],
    [l.consOreManutenzione, t.manutenzione, 'manutenzione'],
    [l.consOreSostituzione ?? 0, t.sostituzione, 'sostituzione personale'],
  ]
  for (const [ore, euro, nome] of figure) {
    if (!(ore > 0)) continue
    if (euro === null) return null
    righe.push({ descrizione: `${v(ore)} h ${nome} × ${e(euro)} €/h`, importo: tondo(ore * euro) })
  }
  if (l.consMateriali > 0) righe.push({ descrizione: 'Materiali dedicati', importo: tondo(l.consMateriali) })
  return righe
}

/**
 * Le tariffe che valgono per un lavoro: quelle di base, sostituite figura per
 * figura da quelle della struttura se ne ha (Locanda: detersivi a parte).
 */
export function tariffeDi(base: Tariffe, perStruttura: TariffeStrutture, strutturaCodice: string | null): Tariffe {
  const s = strutturaCodice ? perStruttura[strutturaCodice] : undefined
  if (!s) return base
  return {
    pulizie: s.pulizie ?? base.pulizie,
    manutenzione: s.manutenzione ?? base.manutenzione,
    sostituzione: s.sostituzione ?? base.sostituzione,
  }
}

/** Quante volte cade un giorno della settimana (1 = lunedì) in un mese `YYYY-MM-01`. */
export function volteNelMese(mese: string, giorno: number): number {
  const [a, m] = mese.split('-').map(Number)
  const giorni = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const primo = ((new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7) + 1 // 1 = lunedì
  const scarto = (giorno - primo + 7) % 7
  return Math.floor((giorni - 1 - scarto) / 7) + 1
}

/** Volte nel mese per una frequenza: 1 per mensile, i giorni giusti per settimanale. */
export function volte(mese: string, frequenza: Frequenza | null, giorno: number | null): number {
  return frequenza === 'settimanale' && giorno ? volteNelMese(mese, giorno) : 1
}

export function importiLavoro(l: Lavoro, t: Tariffe): ImportiLavoro {
  const preventivo = importo(l.prevOrePulizie, l.prevOreManutenzione, l.prevMateriali, t, l.prevOreSostituzione)
  const consuntivo =
    l.consOrePulizie === null || l.consOreManutenzione === null || l.consMateriali === null
      ? null
      : importo(l.consOrePulizie, l.consOreManutenzione, l.consMateriali, t, l.consOreSostituzione ?? 0)
  const scostamento = preventivo !== null && consuntivo !== null ? tondo(consuntivo - preventivo) : null
  return { preventivo, consuntivo, scostamento }
}

export const orePreventivo = (l: Lavoro) => l.prevOrePulizie + l.prevOreManutenzione + l.prevOreSostituzione
export const oreConsuntivo = (l: Lavoro) => (l.consOrePulizie ?? 0) + (l.consOreManutenzione ?? 0) + (l.consOreSostituzione ?? 0)

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
  // `ricorrente: true` è il vecchio modulo: valeva "ogni mese".
  const frequenza: Frequenza | null =
    b.frequenza === 'settimanale' ? 'settimanale' : b.frequenza === 'mensile' || b.ricorrente === true ? 'mensile' : null
  const g = Number(b.giornoSettimana)
  const giornoSettimana = frequenza === 'settimanale' && Number.isInteger(g) && g >= 1 && g <= 7 ? g : null
  if (frequenza === 'settimanale' && !giornoSettimana) problemi.push('Scegli il giorno della settimana')

  const dati: DatiLavoro = {
    mese: mese ?? '',
    destinatario: destinatario ?? 'struttura',
    strutturaCodice: destinatario === 'struttura' ? strutturaCodice : null,
    cliente: destinatario === 'esterno' ? cliente : null,
    titolo: titolo ?? '',
    descrizione: testo(b.descrizione),
    frequenza,
    giornoSettimana,
    prevOrePulizie: num(b.prevOrePulizie, 0),
    prevOreManutenzione: num(b.prevOreManutenzione, 0),
    prevOreSostituzione: num(b.prevOreSostituzione, 0),
    prevMateriali: num(b.prevMateriali, 0),
    consOrePulizie: numONull(b.consOrePulizie),
    consOreManutenzione: numONull(b.consOreManutenzione),
    consOreSostituzione: numONull(b.consOreSostituzione),
    consMateriali: numONull(b.consMateriali),
    noteConsuntivo: testo(b.noteConsuntivo),
  }
  const numeri: Array<[string, number | null]> = [
    ['Ore pulizie (preventivo)', dati.prevOrePulizie],
    ['Ore manutenzione (preventivo)', dati.prevOreManutenzione],
    ['Ore sostituzione personale (preventivo)', dati.prevOreSostituzione],
    ['Materiali (preventivo)', dati.prevMateriali],
    ['Ore pulizie (consuntivo)', dati.consOrePulizie],
    ['Ore manutenzione (consuntivo)', dati.consOreManutenzione],
    ['Ore sostituzione personale (consuntivo)', dati.consOreSostituzione],
    ['Materiali (consuntivo)', dati.consMateriali],
  ]
  for (const [nome, v] of numeri) {
    if (v === null) continue
    if (!Number.isFinite(v) || v < 0) problemi.push(`${nome}: serve un numero, zero o più`)
    else if (nome.startsWith('Ore') && v > 2000) problemi.push(`${nome}: ${v} ore sembrano troppe`)
  }
  return problemi.length ? { problemi } : { dati }
}
