/**
 * Piastrella di riepilogo: un numero grande, una didascalia sotto.
 *
 * Prima esistevano quattro copie di questo componente — in GestioneAcquisti,
 * InventarioBeni, TimbratureOperatore e (come `Mini`) in CruscottoTimbrature —
 * con tre vocabolari diversi per gli stessi tre parametri e misure incoerenti.
 * L'API qui è quella già usata da acquisti e inventario, così adottarla non
 * richiede toccare le chiamate.
 *
 * I nomi degli accenti sono quelli dei colori Tailwind di partenza: espliciti,
 * e non c'è da tradurre avanti e indietro quando si sceglie una tinta.
 */

const ACCENTI = {
  amber: 'text-amber-600',
  violet: 'text-violet-600',
  red: 'text-red-600',
  emerald: 'text-emerald-600',
  cyan: 'text-brand-cyan-dark',
  slate: 'text-slate-600',
} as const

export function Kpi({
  titolo,
  valore,
  accento,
  dimensione = 'md',
  tenue = false,
}: {
  titolo: string
  valore: string | number
  accento?: keyof typeof ACCENTI
  /** `lg` per i conteggi brevi, `md` (default) per le stringhe lunghe tipo importi. */
  dimensione?: 'md' | 'lg'
  /** Variante su fondo grigio senza bordo, per le piastrelle dentro una card. */
  tenue?: boolean
}) {
  const colore = accento ? ACCENTI[accento] : 'text-gray-800'
  const contenitore = tenue
    ? 'bg-gray-50 rounded-lg py-2 text-center'
    : 'bg-white rounded-xl border border-gray-100 px-3.5 py-3'

  return (
    <div className={contenitore}>
      <p className={`${dimensione === 'lg' ? 'text-2xl' : 'text-xl'} font-bold ${colore}`}>{valore}</p>
      <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{titolo}</p>
    </div>
  )
}
