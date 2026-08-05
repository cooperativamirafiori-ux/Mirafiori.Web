/**
 * Riquadro di messaggio: errore, conferma, avviso.
 *
 * Il banner rosso era ripetuto cinque volte con le stesse classi, e i messaggi
 * di successo erano scritti ogni volta in modo un po' diverso. Non renderizza
 * niente se non c'è testo, così al posto di
 *
 *   {errore && <div className="…">{errore}</div>}
 *
 * si scrive `<Banner tono="errore">{errore}</Banner>`.
 */

const TONI = {
  errore: 'bg-red-50 border-red-200 text-red-700',
  ok: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  avviso: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-gray-50 border-gray-200 text-gray-600',
} as const

export function Banner({
  tono = 'info',
  children,
}: {
  tono?: keyof typeof TONI
  children?: React.ReactNode
}) {
  if (!children) return null
  return (
    <div className={`border text-sm rounded-xl px-4 py-3 ${TONI[tono]}`} role={tono === 'errore' ? 'alert' : undefined}>
      {children}
    </div>
  )
}
