'use client'

/**
 * Ricerca di un cliente in archivio.
 *
 * **La ricerca lavora in locale.** L'indice completo arriva col caricamento
 * della pagina (una riga per cliente: denominazione, codici, comune — circa
 * 60 KB per 700 clienti), così scrivere è istantaneo e non si chiama il server
 * a ogni lettera. Solo quando si sceglie un cliente si chiede la scheda intera.
 *
 * I risultati sono bottoni grandi sotto la casella, non una tendina che si
 * chiude toccando fuori: col pollice è facile chiuderla per sbaglio.
 *
 * Non tiene i dati del cliente: li passa al modulo con `onScegli`.
 */

import { useMemo, useState } from 'react'
import { cercaClienti, type Cliente, type ClienteIndice } from '@/types/clienti'

/** Chiede la scheda completa di un cliente. La usano la ricerca e la partita IVA. */
export async function caricaScheda(id: string): Promise<Cliente> {
  const res = await fetch(`/api/clienti/${id}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Non riesco a leggere la scheda del cliente')
  return data.cliente as Cliente
}

export function RicercaCliente({
  clienti,
  onScegli,
  onErrore,
}: {
  clienti: ClienteIndice[]
  onScegli: (cliente: Cliente) => void
  onErrore: (messaggio: string) => void
}) {
  const [query, setQuery] = useState('')
  const [caricando, setCaricando] = useState('')

  const risultati = useMemo(
    () => (query.trim().length >= 2 ? cercaClienti(clienti, query, 6) : []),
    [clienti, query],
  )

  async function scegli(c: ClienteIndice) {
    setCaricando(c.id)
    try {
      onScegli(await caricaScheda(c.id))
    } catch (err: any) {
      onErrore(err.message)
    } finally {
      setCaricando('')
    }
  }

  if (!clienti.length) return null

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="block text-sm font-semibold text-gray-700 mb-1.5">
          Cerca il cliente fra quelli già registrati
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Scrivi il nome o il cognome"
          autoComplete="off"
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>

      {query.trim().length >= 2 &&
        (risultati.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-3 text-base text-gray-600">
            Non l&apos;abbiamo trovato. Nessun problema: rispondi alle domande qui sotto.
          </p>
        ) : (
          <ul className="space-y-2">
            {risultati.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => scegli(c)}
                  disabled={Boolean(caricando)}
                  className="min-h-[56px] w-full rounded-2xl border-2 border-gray-200 bg-white px-4 py-3 text-left hover:border-gray-300 disabled:opacity-60"
                >
                  <span className="block text-base font-semibold text-gray-800">
                    {caricando === c.id ? 'Un attimo…' : c.d}
                  </span>
                  <span className="block text-sm text-gray-500">
                    {[c.c, c.pi && `P.IVA ${c.pi}`, !c.pi && c.cf && `CF ${c.cf}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
