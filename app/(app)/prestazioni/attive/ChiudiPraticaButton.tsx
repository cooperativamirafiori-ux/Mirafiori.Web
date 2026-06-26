'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Segna la pratica come "Chiusa". Visibile solo quando la notula è stata
 * caricata dal prestatore (stato "Notula ricevuta"). Chiede conferma.
 */
export function ChiudiPraticaButton({ spItemId }: { spItemId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function chiudi() {
    if (!window.confirm('Segnare questa pratica come chiusa? L’operazione la rimuove dalle prestazioni attive.')) {
      return
    }
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/prestazioni/${spItemId}/chiudi`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore durante la chiusura')
      setMsg({ ok: true, text: '✅ Pratica chiusa.' })
      router.refresh()
    } catch (err: any) {
      setMsg({ ok: false, text: `⚠️ ${err?.message ?? 'Errore imprevisto'}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={chiudi}
        disabled={loading}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
      >
        {loading ? 'Chiusura…' : '✅ Chiudi la pratica'}
      </button>
      {msg && (
        <p className={`text-xs mt-2 ${msg.ok ? 'text-green-600' : 'text-gray-500'}`}>{msg.text}</p>
      )}
    </div>
  )
}
