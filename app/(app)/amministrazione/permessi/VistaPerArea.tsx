'use client'

/**
 * Rovescio della schermata: per ogni area, chi ci entra.
 *
 * L'elenco per persona risponde a «cosa può fare Tizio»; questa vista risponde
 * a «chi entra in Acquisti», che è la domanda che ci si fa quando qualcuno se
 * ne va o quando si controlla se un'area è aperta a troppa gente. Sono gli
 * stessi dati letti nell'altro verso, non un secondo elenco.
 */

import { Vuoto } from '@/components/ui/Vuoto'

export function VistaPerArea({
  aree,
  descrizioni,
  perm,
  nomi,
  busy,
  onRevoca,
  onApriPersona,
}: {
  aree: string[]
  descrizioni: Record<string, string>
  /** utente → area → id riga SP */
  perm: Record<string, Record<string, string>>
  nomi: Record<string, string>
  busy: string | null
  onRevoca: (utente: string, area: string) => void
  onApriPersona: (utente: string) => void
}) {
  return (
    <div className="space-y-4">
      {aree.map((area) => {
        const persone = Object.keys(perm)
          .filter((u) => perm[u]?.[area])
          .sort((a, b) => (nomi[a] ?? a).localeCompare(nomi[b] ?? b, 'it'))

        return (
          <section key={area} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h3 className="font-bold text-gray-800">{area}</h3>
              <span className="shrink-0 text-xs font-semibold text-gray-400">
                {persone.length === 1 ? '1 persona' : `${persone.length} persone`}
              </span>
            </div>
            {descrizioni[area] && (
              <p className="mb-3 text-sm text-gray-500">{descrizioni[area]}</p>
            )}

            {persone.length === 0 ? (
              <Vuoto>Nessuno ha accesso a quest&apos;area.</Vuoto>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {persone.map((u) => {
                  const inCorso = busy === `${u}|${area}`
                  return (
                    <li
                      key={u}
                      className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 py-1 pl-3 pr-1 text-sm"
                    >
                      <button
                        type="button"
                        onClick={() => onApriPersona(u)}
                        className="max-w-[14rem] truncate font-medium text-gray-700 hover:text-slate-900 hover:underline"
                        title={u}
                      >
                        {nomi[u] ?? u}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRevoca(u, area)}
                        disabled={!!busy}
                        aria-label={`Revoca ${area} a ${nomi[u] ?? u}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-40"
                      >
                        {inCorso ? '…' : '×'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
