'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Pulsante "Genera documenti": chiama POST /api/prestazioni/[id]/documenti,
 * che precompila contratto + autorizzazione GDPR + impegno riservatezza e li
 * carica nella cartella SharePoint della prestazione (stato → "Contratto inviato").
 */
export function GeneraDocumentiButton({
  spItemId,
  cartellaUrl,
}: {
  spItemId: string
  cartellaUrl?: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function genera() {
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/prestazioni/${spItemId}/documenti`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore durante la generazione')
      setMsg({
        ok: true,
        text: data.inviato
          ? '✅ Documenti inviati al prestatore per la firma (DocuSign).'
          : '✅ Documenti generati nella cartella SharePoint (DocuSign non configurato: non ancora inviati).',
      })
      router.refresh()
    } catch (err: any) {
      setMsg({ ok: false, text: `⚠️ ${err?.message ?? 'Errore imprevisto'}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <button
          onClick={genera}
          disabled={loading}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent-purple/10 text-accent-purple hover:bg-accent-purple/20 transition-colors disabled:opacity-50"
        >
          {loading ? 'Invio…' : '📄 Genera e invia per firma'}
        </button>
        {cartellaUrl && (
          <a
            href={cartellaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            📁 Cartella
          </a>
        )}
      </div>
      {msg && (
        <p className={`text-xs mt-2 ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>
      )}
    </div>
  )
}
