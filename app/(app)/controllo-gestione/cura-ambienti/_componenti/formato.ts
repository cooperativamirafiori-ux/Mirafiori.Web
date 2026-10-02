export const euro = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

export const ore = (n: number | null) =>
  n === null ? '—' : `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })} h`

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

export function nomeMese(mese: string): string {
  const [a, m] = mese.split('-').map(Number)
  return `${MESI[m - 1]} ${a}`
}

export function spostaMese(mese: string, delta: number): string {
  const [a, m] = mese.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function meseCorrente(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
