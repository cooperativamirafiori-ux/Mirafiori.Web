/** Formati per le schermate Qonto. Fuso fisso: il server Vercel gira in UTC. */

const FUSO = 'Europe/Rome'

export function euro(n: number | null | undefined, valuta = 'EUR'): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: valuta }).format(n)
}

/** Importo con il segno sempre esplicito: "+120,00 €" / "−42,30 €". */
export function euroConSegno(n: number, valuta = 'EUR'): string {
  const s = euro(Math.abs(n), valuta)
  return n < 0 ? `−${s}` : `+${s}`
}

export function dataBreve(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('it-IT', { timeZone: FUSO, day: '2-digit', month: 'short', year: 'numeric' })
}

export function ora(d = new Date()): string {
  return d.toLocaleTimeString('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
}

/** IBAN a gruppi di quattro, come si legge su carta. */
export function ibanLeggibile(iban: string): string {
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()
}

const TIPI: Record<string, string> = {
  card: 'Carta',
  transfer: 'Bonifico',
  income: 'Entrata',
  direct_debit: 'Addebito diretto',
  qonto_fee: 'Commissione Qonto',
  cheque: 'Assegno',
  swift_income: 'Bonifico estero',
  recall: 'Richiamo',
}

export function tipoMovimento(t: string): string {
  return TIPI[t] ?? t.replace(/_/g, ' ')
}
