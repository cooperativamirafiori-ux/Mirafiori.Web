'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Annulla una pratica salvata ma mai proseguita. Mostrato solo in "Bozza" e
 * solo a chi l'ha aperta o a un amministratore. Il record resta, con stato
 * "Annullata", e sparisce dalle attive.
 */
export function AnnullaPraticaButton({ spItemId, idPrestazione }: { spItemId: string; idPrestazione: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function annulla() {
    if (
      !window.confirm(
        `Annullare la pratica ${idPrestazione}? Sparisce dalle prestazioni attive. ` +
          'I documenti d’identità del prestatore restano in archivio.',
      )
    ) {
      return
    }
    setLoading(true)
    setErrore(null)
    try {
      const res = await fetch(`/api/prestazioni/${spItemId}/annulla`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Errore durante l’annullamento')
      router.refresh()
    } catch (err: any) {
      setErrore(err?.message ?? 'Errore imprevisto')
      setLoading(false)
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={annulla}
        disabled={loading}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
      >
        {loading ? 'Annullamento…' : '✕ Annulla pratica'}
      </button>
      {errore && <p className="text-xs mt-2 text-red-600">⚠️ {errore}</p>}
    </div>
  )
}
