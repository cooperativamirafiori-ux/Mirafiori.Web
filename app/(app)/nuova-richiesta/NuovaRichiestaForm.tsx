'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Struttura } from '@/types/manutenzioni'

interface Props {
  strutture: Struttura[]
  tipiIntervento: string[]
  priorita: string[]
}

export function NuovaRichiestaForm({ strutture, tipiIntervento, priorita }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [form, setForm] = useState({
    strutturaId: '',
    tipoIntervento: '',
    priorita: '',
    descrizione: '',
  })

  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.strutturaId || !form.tipoIntervento || !form.priorita || !form.descrizione.trim()) {
      setError('⚠️ Compila tutti i campi obbligatori.')
      return
    }

    const strutturaObj = strutture.find((s) => String(s.id) === form.strutturaId)
    if (!strutturaObj) { setError('Struttura non trovata'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/manutenzioni', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strutturaId: strutturaObj.id,
          strutturaNome: strutturaObj.strutturaLabel,
          tipoIntervento: form.tipoIntervento,
          priorita: form.priorita,
          descrizione: form.descrizione,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore invio')

      setSuccess(`✅ Richiesta inviata: ${data.idRichiesta}`)
      setForm({ strutturaId: '', tipoIntervento: '', priorita: '', descrizione: '' })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6 space-y-5">
      <h2 className="text-lg font-semibold text-primary-dark">Inserisci richiesta</h2>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg">
          {success}
          <button
            type="button"
            onClick={() => router.push('/mie-richieste')}
            className="ml-3 underline"
          >
            Vedi le mie richieste →
          </button>
        </div>
      )}

      {/* Struttura */}
      <div>
        <label className={labelClass}>Struttura *</label>
        <select
          value={form.strutturaId}
          onChange={(e) => set('strutturaId', e.target.value)}
          className={selectClass}
          required
        >
          <option value="">— Seleziona struttura —</option>
          {strutture.map((s) => (
            <option key={String(s.id)} value={s.id}>
              {s.strutturaLabel}
            </option>
          ))}
        </select>
      </div>

      {/* Tipo intervento */}
      <div>
        <label className={labelClass}>Tipo intervento *</label>
        <select
          value={form.tipoIntervento}
          onChange={(e) => set('tipoIntervento', e.target.value)}
          className={selectClass}
          required
        >
          <option value="">— Seleziona tipo —</option>
          {tipiIntervento.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Priorità */}
      <div>
        <label className={labelClass}>Priorità *</label>
        <select
          value={form.priorita}
          onChange={(e) => set('priorita', e.target.value)}
          className={selectClass}
          required
        >
          <option value="">— Seleziona priorità —</option>
          {priorita.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Descrizione */}
      <div>
        <label className={labelClass}>Descrizione problema *</label>
        <textarea
          value={form.descrizione}
          onChange={(e) => set('descrizione', e.target.value)}
          className={`${selectClass} resize-none h-28`}
          placeholder="Descrivi il problema..."
          required
        />
      </div>

      {/* Azioni */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push('/home')}
          className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50"
        >
          ← Indietro
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-accent-purple text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:opacity-90"
        >
          {loading ? 'Invio in corso...' : 'Invia richiesta'}
        </button>
      </div>
    </form>
  )
}
