'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Struttura } from '@/types/manutenzioni'

interface Props {
  strutture: Struttura[]
  categorie: string[]
  fornitori: string[]
}

export function InserisciCostoForm({ strutture, categorie, fornitori }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const oggi = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    strutturaId: '',
    categoria: '',
    importo: '',
    dataCosto: oggi,
    fornitore: '',
    causale: '',
  })

  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.strutturaId || !form.categoria.trim() || !form.importo || !form.dataCosto) {
      setError('⚠️ Compila struttura, categoria, importo e data.')
      return
    }
    const importoNum = parseFloat(form.importo)
    if (!Number.isFinite(importoNum) || importoNum <= 0) {
      setError('⚠️ L\'importo deve essere un numero maggiore di zero.')
      return
    }

    const strutturaObj = strutture.find((s) => String(s.id) === form.strutturaId)
    if (!strutturaObj) { setError('Struttura non trovata'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/costi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strutturaId: strutturaObj.id,
          categoria: form.categoria,
          importo: importoNum,
          dataCosto: form.dataCosto,
          fornitore: form.fornitore || undefined,
          causale: form.causale || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore inserimento')

      setSuccess(
        `✅ Costo registrato su ${strutturaObj.strutturaLabel}: €${importoNum.toFixed(2)}`
      )
      // Reset mantenendo struttura e data per inserimenti multipli
      setForm((f) => ({ ...f, categoria: '', importo: '', fornitore: '', causale: '' }))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-primary-dark">Costo diretto su struttura</h2>
        <p className="text-sm text-gray-500 mt-1">
          Registra un costo senza aprire una richiesta di manutenzione.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg">
          {success}
          <button
            type="button"
            onClick={() => router.push('/cruscotto-costi')}
            className="ml-3 underline"
          >
            Vai al cruscotto →
          </button>
        </div>
      )}

      {/* Struttura */}
      <div>
        <label className={labelClass}>Struttura *</label>
        <select
          value={form.strutturaId}
          onChange={(e) => set('strutturaId', e.target.value)}
          className={inputClass}
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

      {/* Categoria (campo libero con suggerimenti) */}
      <div>
        <label className={labelClass}>Categoria *</label>
        <input
          type="text"
          list="categorie-costi"
          value={form.categoria}
          onChange={(e) => set('categoria', e.target.value)}
          className={inputClass}
          placeholder="Es. Utenze, Manutenzione ordinaria..."
          required
        />
        <datalist id="categorie-costi">
          {categorie.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {/* Importo + Data */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Importo (€) *</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.importo}
            onChange={(e) => set('importo', e.target.value)}
            className={inputClass}
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <label className={labelClass}>Data costo *</label>
          <input
            type="date"
            value={form.dataCosto}
            onChange={(e) => set('dataCosto', e.target.value)}
            className={inputClass}
            required
          />
        </div>
      </div>

      {/* Fornitore (campo libero con elenco tecnici/fornitori) */}
      <div>
        <label className={labelClass}>Fornitore</label>
        <input
          type="text"
          list="fornitori-costi"
          value={form.fornitore}
          onChange={(e) => set('fornitore', e.target.value)}
          className={inputClass}
          placeholder="Scegli dall'elenco o scrivi un nuovo fornitore"
        />
        <datalist id="fornitori-costi">
          {fornitori.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>

      {/* Causale */}
      <div>
        <label className={labelClass}>Causale / descrizione</label>
        <input
          type="text"
          value={form.causale}
          onChange={(e) => set('causale', e.target.value)}
          className={inputClass}
          placeholder="Opzionale — es. Fattura Enel giugno"
        />
      </div>

      {/* Azioni */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push('/manutenzioni')}
          className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50"
        >
          ← Indietro
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-accent-purple text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:opacity-90"
        >
          {loading ? 'Salvataggio...' : 'Registra costo'}
        </button>
      </div>
    </form>
  )
}
