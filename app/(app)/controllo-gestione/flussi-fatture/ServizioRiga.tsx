'use client'

/**
 * Il servizio (centro di costo) di una riga di Flussi fatture.
 *
 * È il dato che dice da quale sottoconto Qonto parte il bonifico: senza, la
 * fattura non si può mandare a Qonto. Di solito lo sceglie il coordinatore
 * dalla scheda "Fatture del servizio"; qui chi paga lo vede e lo corregge.
 */

import { useState } from 'react'

export interface Centro {
  codice: string
  nome: string
}

export function ServizioRiga({
  fatturaId,
  cc,
  centri,
  modificabile,
  onFatto,
}: {
  fatturaId: string
  cc: string | null
  centri: Centro[]
  modificabile: boolean
  onFatto: () => Promise<void>
}) {
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')
  const nome = cc ? (centri.find((c) => c.codice === cc)?.nome ?? cc) : null

  async function cambia(nuovo: string) {
    setInCorso(true)
    setErrore('')
    try {
      const res = await fetch('/api/centri-costo/fatture', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fatturaId, cc: nuovo || null }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Non riuscito')
      await onFatto()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Non riuscito')
    } finally {
      setInCorso(false)
    }
  }

  if (!modificabile) {
    return (
      <p className="text-xs mt-1">
        {nome ? (
          <span className="font-semibold text-cyan-800">{nome}</span>
        ) : (
          <span className="text-gray-400">nessun servizio</span>
        )}
      </p>
    )
  }

  return (
    <div className="mt-1 text-xs">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-gray-500">Servizio</span>
        <select
          value={cc ?? ''}
          disabled={inCorso}
          onChange={(e) => void cambia(e.target.value)}
          className={`rounded-lg border px-2 py-1 text-xs max-w-full ${
            cc ? 'border-cyan-300 bg-cyan-50 text-cyan-900 font-semibold' : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <option value="">— da scegliere —</option>
          {centri.map((c) => (
            <option key={c.codice} value={c.codice}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      {errore && <p className="text-red-700 mt-0.5">{errore}</p>}
    </div>
  )
}
