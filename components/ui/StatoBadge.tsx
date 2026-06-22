import type { StatoRichiesta } from '@/types/manutenzioni'

const colors: Record<StatoRichiesta, string> = {
  Aperta: 'bg-red-100 text-red-700',
  'In lavorazione': 'bg-orange-100 text-orange-700',
  Completata: 'bg-green-100 text-green-700',
}

export function StatoBadge({ stato }: { stato: StatoRichiesta }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[stato] ?? 'bg-gray-100 text-gray-600'}`}>
      {stato}
    </span>
  )
}
