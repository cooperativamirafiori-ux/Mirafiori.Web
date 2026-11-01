'use client'

/**
 * Pannello di controllo — "ho visto la vostra richiesta" e lungo corso.
 *
 * - Richiesta Aperta: riquadro "Prendi in carico" con la nota per il
 *   richiedente (va per mail e resta nei messaggi) e, se serve, la spunta
 *   Lungo corso con la previsione. Non serve un tecnico.
 * - Dopo: resta solo il riquadro Lungo corso, per spostarla dentro o fuori la
 *   sezione del Pannello.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RichiestaManutenzione } from '@/types/manutenzioni'
import { Banner } from '@/components/ui/Banner'

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50'

export function PresaInCarico({ richiesta: r }: { richiesta: RichiestaManutenzione }) {
  const router = useRouter()
  const aperta = r.stato === 'Aperta'
  const [nota, setNota] = useState('')
  const [lungo, setLungo] = useState(r.lungoCorso)
  const [previsione, setPrevisione] = useState(r.previsioneLungoCorso ?? '')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null)

  async function chiama(url: string, method: string, body: unknown, ok: string) {
    setLoading(true); setMsg(null)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Errore')
      setMsg({ tono: 'ok', testo: ok })
      router.refresh()
      return true
    } catch (e: any) {
      setMsg({ tono: 'errore', testo: e.message })
      return false
    } finally {
      setLoading(false)
    }
  }

  const base = `/api/manutenzioni/${encodeURIComponent(r.spItemId)}`

  async function prendi() {
    if (!nota.trim()) { setMsg({ tono: 'errore', testo: 'Scrivi una nota per il richiedente' }); return }
    const fatto = await chiama(`${base}/presa-in-carico`, 'POST',
      { nota: nota.trim(), lungoCorso: lungo, previsione: previsione.trim() },
      '✅ Presa in carico: il richiedente riceve la mail')
    if (fatto) setNota('')
  }

  function salvaLungo() {
    chiama(`${base}/lungo-corso`, 'PATCH',
      { lungoCorso: lungo, previsione: previsione.trim() },
      lungo ? '✅ Spostata in Lungo corso' : '✅ Tolta da Lungo corso')
  }

  const cambiato = lungo !== r.lungoCorso || (lungo && previsione.trim() !== (r.previsioneLungoCorso ?? ''))

  const spuntaLungo = (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={lungo} onChange={(e) => setLungo(e.target.checked)}
          className="h-5 w-5 accent-primary" disabled={loading} />
        Lavoro di lungo corso
      </label>
      {lungo && (
        <input value={previsione} onChange={(e) => setPrevisione(e.target.value)} className={inputCls}
          placeholder="Previsione (facoltativa), es. primavera 2027" maxLength={255} disabled={loading} />
      )}
    </div>
  )

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-3">
      <Banner tono={msg?.tono}>{msg?.testo}</Banner>

      {aperta ? (
        <>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Prendi in carico</p>
          <p className="text-xs text-gray-500">
            Avvisa il richiedente che hai visto la richiesta, anche senza assegnare un tecnico.
          </p>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} className={`${inputCls} resize-none h-20`}
            placeholder="Nota per il richiedente — arriva per mail e resta nei messaggi" maxLength={4000} disabled={loading} />
          {spuntaLungo}
          <button onClick={prendi} disabled={loading || !nota.trim()}
            className="w-full sm:w-auto px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-primary-dark">
            {loading ? 'Invio…' : 'Prendi in carico e avvisa'}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Lungo corso</p>
          {spuntaLungo}
          <button onClick={salvaLungo} disabled={loading || !cambiato}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg disabled:opacity-40 hover:bg-gray-50">
            Salva
          </button>
        </>
      )}
    </div>
  )
}
