'use client'

/** IBAN leggibile a gruppi di quattro, con il tasto per copiarlo senza spazi. */

import { useState } from 'react'

export function CopiaIban({ iban }: { iban: string }) {
  const [copiato, setCopiato] = useState(false)
  const leggibile = iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()

  async function copia() {
    try {
      await navigator.clipboard.writeText(iban.replace(/\s+/g, ''))
      setCopiato(true)
      setTimeout(() => setCopiato(false), 2000)
    } catch {
      // Clipboard negato (http, permessi): l'IBAN resta selezionabile a mano.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm text-gray-700 break-all select-all">{leggibile}</span>
      <button
        type="button"
        onClick={copia}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
      >
        {copiato ? '✓ Copiato' : 'Copia'}
      </button>
    </div>
  )
}
