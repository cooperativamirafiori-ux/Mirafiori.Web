'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Tecnico } from '@/types/manutenzioni'

interface Props {
  spItemId: string
  tecnici: Tecnico[]
  tecnicoAttualeId?: number
}

export function AssegnaTecnico({ spItemId, tecnici, tecnicoAttualeId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string>(tecnicoAttualeId?.toString() ?? '')

  async function handleAssegna(tecnicoId: string) {
    if (!tecnicoId || tecnicoId === tecnicoAttualeId?.toString()) {
      setOpen(false)
      return
    }
    const tecnico = tecnici.find((t) => t.id.toString() === tecnicoId)
    if (!tecnico) return

    setLoading(true)
    try {
      const res = await fetch(`/api/manutenzioni/${spItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tecnicoId: tecnico.id,
          tecnicoNome: tecnico.title,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error ?? 'Errore assegnazione')
        return
      }
      setSelected(tecnicoId)
      setOpen(false)
      router.refresh()
    } catch {
      alert('Errore di rete')
    } finally {
      setLoading(false)
    }
  }

  const tecnicoCorrente = tecnici.find((t) => t.id.toString() === selected)

  return (
    <div className="relative" onClick={(e) => e.preventDefault()}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
            tecnicoCorrente
              ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
          }`}
        >
          {tecnicoCorrente ? `🔨 ${tecnicoCorrente.title}` : '⚠ Assegna tecnico'}
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <select
            autoFocus
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={loading}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            <option value="">— Seleziona —</option>
            {tecnici.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}{t.ditta ? ` (${t.ditta})` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => handleAssegna(selected)}
            disabled={loading || !selected}
            className="text-xs bg-primary text-white px-2 py-1 rounded-lg disabled:opacity-50 hover:bg-primary-dark"
          >
            {loading ? '…' : '✓'}
          </button>
          <button
            onClick={() => setOpen(false)}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-gray-600 px-1 py-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
