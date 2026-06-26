'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Fase chiusura: inserimento importo lordo → genera e invia la notula
 * precompilata al prestatore (POST /api/prestazioni/[id]/notula).
 */
export function ChiusuraNotula({
  spItemId,
  importoLordo,
}: {
  spItemId: string
  importoLordo?: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [importo, setImporto] = useState(importoLordo ? String(importoLordo) : '')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function invia() {
    const val = Number(importo.replace(',', '.'))
    if (!Number.isFinite(val) || val <= 0) {
      setMsg({ ok: false, text: '⚠️ Inserisci un importo lordo valido.' })
      return
    }
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/prestazioni/${spItemId}/notula`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importoLordo: val }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore durante l’invio')
      setMsg({
        ok: true,
        text: `✅ Notula inviata al prestatore (netto € ${Number(data.netto).toLocaleString('it-IT', { minimumFractionDigits: 2 })}).`,
      })
      router.refresh()
    } catch (err: any) {
      setMsg({ ok: false, text: `⚠️ ${err?.message ?? 'Errore imprevisto'}` })
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      >
        💶 Importo lordo & notula
      </button>
    )
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <label className="block text-xs font-medium text-gray-600 mb-1">
        Importo lordo (€) da pagare al prestatore
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          step="0.01"
          value={importo}
          onChange={(e) => setImporto(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Es. 300,00"
        />
        <button
          onClick={invia}
          disabled={loading}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-primary text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Invio…' : 'Genera e invia'}
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        Genera la notula precompilata (ritenuta 20%) e la invia al prestatore con il link per ricaricarla firmata.
      </p>
      {msg && (
        <p className={`text-xs mt-2 ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>
      )}
    </div>
  )
}
