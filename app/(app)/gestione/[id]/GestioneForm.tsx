'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RichiestaManutenzione, Tecnico } from '@/types/manutenzioni'

interface Props {
  richiesta: RichiestaManutenzione
  tecnici: Tecnico[]
}

export function GestioneForm({ richiesta, tecnici }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [tecnicoId, setTecnicoId] = useState<string>(
    richiesta.tecnico?.id?.toString() ?? ''
  )
  const [importo, setImporto] = useState<string>(
    richiesta.importoFattura?.toString() ?? ''
  )
  const [ore, setOre] = useState<string>(
    richiesta.oreLavoro?.toString() ?? ''
  )
  const [dataIntervento, setDataIntervento] = useState<string>(
    richiesta.dataIntervento
      ? richiesta.dataIntervento.slice(0, 10)
      : ''
  )
  const [note, setNote] = useState<string>(richiesta.noteResponsabile ?? '')

  const isCompletata = richiesta.stato === 'Completata'

  async function handleSalva(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!tecnicoId && !importo && !ore) {
      setError('Compila almeno un campo: tecnico, importo o ore.')
      return
    }

    const tecnicoObj = tecnici.find((t) => t.id === Number(tecnicoId))
    const payload: Record<string, unknown> = {}

    if (tecnicoId && !richiesta.tecnico) {
      // Prima assegnazione tecnico
      payload.tecnicoId = Number(tecnicoId)
      payload.tecnicoNome = tecnicoObj?.title ?? ''
    }
    if (importo) payload.importoFattura = parseFloat(importo)
    if (ore) payload.oreLavoro = parseFloat(ore)
    if (dataIntervento) payload.dataIntervento = new Date(dataIntervento).toISOString()
    if (note) payload.noteResponsabile = note

    setLoading(true)
    try {
      const res = await fetch(`/api/manutenzioni/${richiesta.spItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore')

      const msg =
        data.stato === 'Completata'
          ? `✅ Richiesta chiusa — Importo totale: €${data.importoTotale?.toFixed(2)}`
          : data.stato === 'In lavorazione'
          ? '✅ Tecnico assegnato — richiedente notificato'
          : '✅ Dati aggiornati'

      setSuccess(msg)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50 disabled:text-gray-400'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <form onSubmit={handleSalva} className="bg-white rounded-2xl shadow p-5 space-y-4">
      <h3 className="font-semibold text-gray-700">Gestione intervento</h3>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg">{success}</div>
      )}

      {/* Tecnico */}
      <div>
        <label className={labelClass}>Tecnico assegnato</label>
        <select
          value={tecnicoId}
          onChange={(e) => setTecnicoId(e.target.value)}
          className={inputClass}
          disabled={isCompletata}
        >
          <option value="">— Nessuno —</option>
          {tecnici.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}{t.ditta ? ` (${t.ditta})` : ''}
            </option>
          ))}
        </select>
        {tecnicoId && (
          <p className="text-xs text-gray-400 mt-1">
            📞 {tecnici.find((t) => t.id === Number(tecnicoId))?.telefono ?? '—'}
          </p>
        )}
      </div>

      {/* Importo fattura */}
      <div>
        <label className={labelClass}>Importo fattura (€)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={importo}
          onChange={(e) => setImporto(e.target.value)}
          className={inputClass}
          placeholder="0.00"
          disabled={isCompletata}
        />
      </div>

      {/* Ore lavoro */}
      <div>
        <label className={labelClass}>Ore lavoro interno</label>
        <input
          type="number"
          min="0"
          step="0.5"
          value={ore}
          onChange={(e) => setOre(e.target.value)}
          className={inputClass}
          placeholder="0"
          disabled={isCompletata}
        />
        <p className="text-xs text-gray-400 mt-1">
          Verrà moltiplicato per la tariffa oraria da Parametri Configurazione
        </p>
      </div>

      {/* Data intervento */}
      <div>
        <label className={labelClass}>Data intervento</label>
        <input
          type="date"
          value={dataIntervento}
          onChange={(e) => setDataIntervento(e.target.value)}
          className={inputClass}
          disabled={isCompletata}
        />
      </div>

      {/* Note */}
      <div>
        <label className={labelClass}>Note responsabile</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={`${inputClass} resize-none h-20`}
          placeholder="Note interne..."
          disabled={isCompletata}
        />
      </div>

      {/* Azioni */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50"
        >
          ← Dashboard
        </button>
        {!isCompletata && (
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-accent-yellow text-primary-dark py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:opacity-90"
          >
            {loading ? 'Salvataggio...' : 'Salva e chiudi'}
          </button>
        )}
      </div>
    </form>
  )
}
