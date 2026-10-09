/** Formati condivisi dalle schermate Utenze, Costi fissi e Costi per struttura. */

export const MESI = ['G', 'F', 'M', 'A', 'M', 'G', 'L', 'A', 'S', 'O', 'N', 'D']
export const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

export function euro(n: number, decimali = 0): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: decimali, maximumFractionDigits: decimali })
}

export function numero(n: number, decimali = 0): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: decimali, maximumFractionDigits: decimali })
}

/** 2026-08-01 → 1 ago 2026 */
export function data(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const COLORE_TIPO: Record<string, string> = { luce: '#e0a400', gas: '#2a78d4', acqua: '#14a3c7', altro: '#a3a3a3' }
export const EMOJI_TIPO: Record<string, string> = { luce: '⚡', gas: '🔥', acqua: '💧', altro: '•' }
