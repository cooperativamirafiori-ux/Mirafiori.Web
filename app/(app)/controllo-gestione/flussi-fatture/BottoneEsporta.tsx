'use client'

/**
 * Bottone "Esporta in Excel" degli elenchi di Flussi fatture.
 * Esporta quello che c'è a schermo (ricerca compresa): i fogli si calcolano
 * al clic, così il bottone non rifà niente finché nessuno lo preme.
 */

import { useState } from 'react'
import { esportaXlsx, type Foglio } from '@/lib/core/esporta-xlsx'

export function BottoneEsporta({ nomeFile, fogli }: { nomeFile: string; fogli: () => Foglio[] }) {
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')

  async function esporta() {
    setInCorso(true)
    setErrore('')
    try {
      await esportaXlsx(nomeFile, fogli())
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Esportazione non riuscita')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {errore && <span className="text-xs text-red-600">{errore}</span>}
      <button
        type="button"
        onClick={() => void esporta()}
        disabled={inCorso}
        className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {inCorso ? 'Preparo il file…' : 'Esporta in Excel'}
      </button>
    </span>
  )
}
