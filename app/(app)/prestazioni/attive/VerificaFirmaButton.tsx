'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Controlla su DocuSign se i documenti sono stati firmati. Se sì, li scarica
 * nella cartella SharePoint e lo stato passa a "Contratto firmato".
 */
export function VerificaFirmaButton({ spItemId }: { spItemId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function verifica() {
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/prestazioni/${spItemId}/verifica-firma`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore durante la verifica')
      if (data.firmato) {
        setMsg({ ok: true, text: '✅ Firmato! Documenti archiviati in cartella.' })
        router.refresh()
      } else if (data.status === 'nessuna-busta') {
        setMsg({ ok: false, text: 'Nessuna busta DocuSign per questa prestazione.' })
      } else if (data.status === 'non-configurato') {
        setMsg({ ok: false, text: 'DocuSign non configurato.' })
      } else {
        setMsg({ ok: false, text: `Non ancora firmato (stato: ${data.status}).` })
      }
    } catch (err: any) {
      setMsg({ ok: false, text: `⚠️ ${err?.message ?? 'Errore imprevisto'}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={verifica}
        disabled={loading}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
      >
        {loading ? 'Verifica…' : '🖊️ Verifica firma'}
      </button>
      {msg && (
        <p className={`text-xs mt-2 ${msg.ok ? 'text-green-600' : 'text-gray-500'}`}>{msg.text}</p>
      )}
    </div>
  )
}
