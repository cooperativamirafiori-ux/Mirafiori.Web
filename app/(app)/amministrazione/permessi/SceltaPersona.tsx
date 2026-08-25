'use client'

/**
 * Scelta di una persona dalla rubrica della cooperativa.
 *
 * Prima qui si batteva l'email a mano: bastava un carattere sbagliato per
 * creare un permesso a un indirizzo inesistente, silenziosamente. Ora si cerca
 * per nome o per email fra gli account veri, e l'email non la scrive nessuno.
 *
 * Resta possibile inserire un indirizzo a mano, ma solo come ripiego: se la
 * rubrica non è leggibile (permesso Graph mancante, rete) la pagina deve
 * continuare a funzionare invece di diventare inutilizzabile.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

export interface VoceRubrica {
  email: string
  nome: string
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MAX_RISULTATI = 8

export function SceltaPersona({
  rubrica,
  giaPresenti,
  onScegli,
}: {
  rubrica: VoceRubrica[]
  /** Email già in elenco: si possono scegliere, ma vanno segnalate. */
  giaPresenti: string[]
  onScegli: (voce: VoceRubrica) => void
}) {
  const [testo, setTesto] = useState('')
  const [aperto, setAperto] = useState(false)
  const [evidenziato, setEvidenziato] = useState(0)
  const contenitore = useRef<HTMLDivElement>(null)

  const presenti = useMemo(
    () => new Set(giaPresenti.map((e) => e.toLowerCase())),
    [giaPresenti],
  )

  const risultati = useMemo(() => {
    const q = testo.toLowerCase().trim()
    if (!q) return rubrica.slice(0, MAX_RISULTATI)
    return rubrica
      .filter((v) => v.nome.toLowerCase().includes(q) || v.email.includes(q))
      .slice(0, MAX_RISULTATI)
  }, [rubrica, testo])

  // Email scritta a mano: si propone solo se non corrisponde già a un
  // risultato, così non si offrono due volte le stesse persone.
  const emailLibera = useMemo(() => {
    const e = testo.toLowerCase().trim()
    if (!EMAIL_RE.test(e)) return null
    if (risultati.some((v) => v.email === e)) return null
    return e
  }, [testo, risultati])

  const voci: VoceRubrica[] = emailLibera
    ? [...risultati, { email: emailLibera, nome: emailLibera }]
    : risultati

  useEffect(() => setEvidenziato(0), [testo])

  // Chiusura al clic fuori: senza questo la tendina resta aperta sopra
  // l'elenco delle persone e sembra un pezzo di interfaccia bloccato.
  useEffect(() => {
    function fuori(e: MouseEvent) {
      if (contenitore.current && !contenitore.current.contains(e.target as Node)) {
        setAperto(false)
      }
    }
    document.addEventListener('mousedown', fuori)
    return () => document.removeEventListener('mousedown', fuori)
  }, [])

  function scegli(v: VoceRubrica) {
    onScegli({ email: v.email.toLowerCase(), nome: v.nome })
    setTesto('')
    setAperto(false)
  }

  function tasti(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAperto(true)
      setEvidenziato((i) => Math.min(i + 1, voci.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setEvidenziato((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const v = voci[evidenziato]
      if (v) scegli(v)
    } else if (e.key === 'Escape') {
      setAperto(false)
    }
  }

  return (
    <div ref={contenitore} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={aperto}
        aria-controls="rubrica-risultati"
        autoComplete="off"
        placeholder={
          rubrica.length
            ? 'Cerca una persona per nome o email…'
            : 'Scrivi l’email aziendale…'
        }
        value={testo}
        onChange={(e) => {
          setTesto(e.target.value)
          setAperto(true)
        }}
        onFocus={() => setAperto(true)}
        onKeyDown={tasti}
        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
      />

      {aperto && (
        <div
          id="rubrica-risultati"
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          {voci.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-400">
              {rubrica.length
                ? 'Nessuna persona trovata. Scrivi l’email per intero per aggiungerla comunque.'
                : 'Rubrica non disponibile: scrivi l’email aziendale per intero.'}
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {voci.map((v, i) => {
                const nota = presenti.has(v.email)
                  ? 'già in elenco'
                  : v.email === emailLibera
                    ? 'fuori rubrica'
                    : null
                return (
                  <li key={v.email}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === evidenziato}
                      onMouseEnter={() => setEvidenziato(i)}
                      onClick={() => scegli(v)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                        i === evidenziato ? 'bg-slate-50' : 'bg-white'
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold uppercase text-slate-600">
                        {v.nome.charAt(0) || '?'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">
                          {v.nome}
                        </span>
                        <span className="block truncate text-xs text-gray-400">{v.email}</span>
                      </span>
                      {nota && (
                        <span className="shrink-0 text-[11px] font-semibold text-gray-400">
                          {nota}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
