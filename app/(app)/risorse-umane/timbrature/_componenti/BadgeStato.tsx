/**
 * Pastiglia di stato del foglio ore mensile.
 *
 * Sta in un file suo perche' la usano l'elenco e la scheda di dettaglio: il
 * colore dello stato e' l'informazione che si legge a colpo d'occhio, e due
 * mappe di colori in due file divergono al primo stato nuovo.
 */

import { ETICHETTA_STATO, type StatoMese } from '@/types/timbrature'

const STILE: Record<StatoMese, string> = {
  aperto: 'bg-gray-100 text-gray-500',
  da_validare: 'bg-amber-100 text-amber-800',
  validato: 'bg-sky-100 text-sky-800',
  confermato: 'bg-emerald-100 text-emerald-700',
  contestato: 'bg-orange-100 text-orange-800',
}

export function BadgeStato({ stato }: { stato: StatoMese }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STILE[stato]}`}>
      {ETICHETTA_STATO[stato]}
    </span>
  )
}
