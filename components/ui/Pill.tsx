/**
 * Etichetta tonda con pallino opzionale, per stati e categorie.
 *
 * Nasce da `Pill` in GestioneRU: l'API `text` / `cls` / `dot` è rimasta quella
 * per non toccare le chiamate esistenti. Per il codice nuovo c'è `tono`, che
 * evita di scrivere classi Tailwind a mano ogni volta.
 *
 * `StatoBadge` resta separato: è la scorciatoia per gli stati delle manutenzioni
 * ed è più grande di questa pillola, quindi unificarli cambierebbe l'aspetto di
 * schermate che oggi vanno bene.
 */

const BASE =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap'

const TONI = {
  neutro: 'bg-gray-100 text-gray-700 border-gray-200',
  verde: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ambra: 'bg-amber-100 text-amber-800 border-amber-200',
  rosso: 'bg-red-100 text-red-700 border-red-200',
  viola: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
  azzurro: 'bg-cyan-100 text-cyan-800 border-cyan-200',
} as const

export function Pill({
  text,
  tono = 'neutro',
  cls,
  dot,
}: {
  text: string
  tono?: keyof typeof TONI
  /** Classi Tailwind esplicite: se presenti vincono su `tono`. */
  cls?: string
  /** Classe del colore del pallino, es. `bg-emerald-500`. */
  dot?: string
}) {
  return (
    <span className={`${BASE} ${cls ?? TONI[tono]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {text}
    </span>
  )
}
