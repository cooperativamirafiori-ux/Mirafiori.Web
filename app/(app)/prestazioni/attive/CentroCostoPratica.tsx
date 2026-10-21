'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CentroDiCosto } from '@/lib/centri-costo/data'

/**
 * Centro di costo della pratica sulla scheda delle attive.
 * - Senza centro (pratiche aperte prima del 21 ott 2026): riquadro ambra con
 *   la tendina, sempre aperta.
 * - Con centro: il nome, e "Cambia" per chi può modificare la pratica.
 * Se la notula è già arrivata, il server riscrive anche la riga nel registro.
 */
export function CentroCostoPratica({
  spItemId,
  centroCostoId,
  centroCosto,
  centri,
  modificabile,
}: {
  spItemId: string
  centroCostoId?: number
  centroCosto?: string
  centri: CentroDiCosto[]
  modificabile: boolean
}) {
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const [scelta, setScelta] = useState(centroCostoId ? String(centroCostoId) : '')
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const nomeAttuale =
    centroCosto || centri.find((c) => c.id === centroCostoId)?.nome || (centroCostoId ? `#${centroCostoId}` : '')
  const mancante = !centroCostoId

  async function salva() {
    if (!scelta) return
    setSalvando(true)
    setErrore(null)
    try {
      const res = await fetch(`/api/prestazioni/${spItemId}/centro-costo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ centroCostoId: Number(scelta) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Salvataggio non riuscito')
      setAperto(false)
      router.refresh()
    } catch (e: any) {
      setErrore(e?.message ?? 'Errore imprevisto')
    } finally {
      setSalvando(false)
    }
  }

  const tendina = (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        value={scelta}
        onChange={(e) => setScelta(e.target.value)}
        className="flex-1 min-w-0 w-full sm:w-auto border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white"
      >
        <option value="">— Seleziona il servizio —</option>
        {centri.map((c) => (
          <option key={c.id} value={c.id}>
            {c.area ? `${c.area} · ${c.nome}` : c.nome}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={salva}
        disabled={!scelta || salvando}
        className="text-xs font-semibold px-3 py-2 rounded-lg bg-accent-purple text-white disabled:opacity-50"
      >
        {salvando ? 'Salvataggio…' : 'Salva'}
      </button>
      {!mancante && (
        <button type="button" onClick={() => setAperto(false)} className="text-xs text-gray-500 underline">
          Lascia com’è
        </button>
      )}
    </div>
  )

  if (mancante) {
    return (
      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
        <p className="text-xs font-semibold text-amber-800">Senza centro di costo</p>
        {modificabile ? (
          tendina
        ) : (
          <p className="text-xs text-amber-700 mt-1">Lo assegna chi ha aperto la pratica o un amministratore.</p>
        )}
        {errore && <p className="text-xs mt-1 text-red-600">⚠️ {errore}</p>}
      </div>
    )
  }

  return (
    <div className="mt-2">
      <p className="text-sm text-gray-600">
        <span className="text-[11px] uppercase tracking-wide text-gray-400">Centro di costo</span>
        <br />
        {nomeAttuale}
        {modificabile && !aperto && (
          <button type="button" onClick={() => setAperto(true)} className="ml-2 text-xs text-accent-purple underline">
            Cambia
          </button>
        )}
      </p>
      {aperto && tendina}
      {errore && <p className="text-xs mt-1 text-red-600">⚠️ {errore}</p>}
    </div>
  )
}
