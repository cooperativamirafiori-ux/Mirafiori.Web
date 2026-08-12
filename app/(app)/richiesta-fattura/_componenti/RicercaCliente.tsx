'use client'

/**
 * Ricerca di un cliente in archivio, con la riga di stato "in archivio / nuovo".
 *
 * **La ricerca lavora in locale.** L'indice completo arriva col caricamento
 * della pagina (una riga per cliente: denominazione, codici, comune — circa
 * 60 KB per 700 clienti), così scrivere è istantaneo e non si chiama il server
 * a ogni lettera. Solo quando si sceglie un cliente si chiede la scheda intera.
 *
 * Sta in un file suo perché il modulo aveva superato le 500 righe, e perché
 * questa è l'unica parte che parla col server per conto proprio.
 *
 * Non tiene i dati del cliente: li passa al modulo con `onScegli` e si limita a
 * mostrare cosa succederà all'archivio. Per svuotare la casella dopo un invio
 * il modulo lo rimonta cambiandogli la `key`: è più onesto che esporre un metodo.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { inputCls, labelCls } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import { cercaClienti, type Cliente, type ClienteIndice } from '@/types/clienti'

export function RicercaCliente({
  clienti,
  scelto,
  modificati,
  mostraStato,
  onScegli,
  onScollega,
  onErrore,
}: {
  clienti: ClienteIndice[]
  /** Nome del cliente collegato, o null se è nuovo / non ancora scelto. */
  scelto: string | null
  /** Quanti campi dell'anagrafica sono stati corretti a mano dopo la scelta. */
  modificati: number
  /** L'avviso "cliente nuovo" ha senso solo quando si è iniziato a compilare. */
  mostraStato: boolean
  onScegli: (cliente: Cliente) => void
  onScollega: () => void
  onErrore: (messaggio: string) => void
}) {
  const [query, setQuery] = useState('')
  const [aperta, setAperta] = useState(false)
  const [caricando, setCaricando] = useState(false)
  const contenitore = useRef<HTMLDivElement>(null)

  const risultati = useMemo(
    () => (query.trim().length >= 2 ? cercaClienti(clienti, query) : []),
    [clienti, query],
  )

  // Chiude la tendina cliccando fuori.
  useEffect(() => {
    const fuori = (e: MouseEvent) => {
      if (contenitore.current && !contenitore.current.contains(e.target as Node)) setAperta(false)
    }
    document.addEventListener('mousedown', fuori)
    return () => document.removeEventListener('mousedown', fuori)
  }, [])

  async function scegli(c: ClienteIndice) {
    setAperta(false)
    setQuery(c.d)
    setCaricando(true)
    try {
      const res = await fetch(`/api/clienti/${c.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Cliente non leggibile')
      onScegli(data.cliente as Cliente)
    } catch (err: any) {
      onErrore(err.message)
    } finally {
      setCaricando(false)
    }
  }

  return (
    <>
      <div ref={contenitore} className="relative">
        <label className="block">
          <span className={labelCls}>Cerca in archivio clienti</span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setAperta(true)
            }}
            onFocus={() => setAperta(true)}
            placeholder={
              clienti.length
                ? `Nome, partita IVA, codice fiscale o comune — ${clienti.length} clienti`
                : 'Archivio clienti non disponibile'
            }
            disabled={!clienti.length}
            className={inputCls}
            autoComplete="off"
          />
        </label>

        {aperta && query.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-auto">
            {risultati.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400">
                Nessun cliente trovato: compila i campi qui sotto e verrà salvato come nuovo.
              </p>
            ) : (
              risultati.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => scegli(c)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <span className="block text-sm font-medium text-gray-800">{c.d}</span>
                  <span className="block text-xs text-gray-400">
                    {[c.pi && `P.IVA ${c.pi}`, c.cf && `CF ${c.cf}`, c.c].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {caricando && <p className="text-xs text-gray-400 mt-1">Carico la scheda…</p>}
      </div>

      {scelto ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
          <div className="flex items-start justify-between gap-3">
            <p>
              Cliente in archivio: <strong>{scelto}</strong>
              {modificati > 0 && (
                <>
                  <br />
                  <span className="text-amber-700">
                    Hai modificato {modificati} {modificati === 1 ? 'campo' : 'campi'}: la scheda
                    verrà aggiornata.
                  </span>
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('')
                onScollega()
              }}
              className="shrink-0 underline text-emerald-700 hover:text-emerald-900"
            >
              Scollega
            </button>
          </div>
        </div>
      ) : (
        mostraStato && (
          <Banner tono="info">
            Cliente nuovo: alla conferma verrà aggiunto all&apos;archivio.
          </Banner>
        )
      )}
    </>
  )
}
