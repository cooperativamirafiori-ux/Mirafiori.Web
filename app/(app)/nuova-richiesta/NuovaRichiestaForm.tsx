'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Allegato } from '@/components/ui/Allegato'
import { caricaDirettamente } from '@/lib/core/upload-diretto'
import type { Struttura } from '@/types/manutenzioni'

interface Props {
  strutture: Struttura[]
  tipiIntervento: string[]
  priorita: string[]
  allegatiAttivi: boolean
}

export function NuovaRichiestaForm({ strutture, tipiIntervento, priorita, allegatiAttivi }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [foto, setFoto] = useState<File | null>(null)
  const [avanzamento, setAvanzamento] = useState<number | null>(null)

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

      // La foto si carica dopo: il nome del file porta il codice della richiesta,
      // che prima dell'invio non esiste ancora.
      let esitoFoto = ''
      if (foto && allegatiAttivi) {
        try {
          setAvanzamento(0)
          await caricaDirettamente({
            file: foto,
            urlSessione: `/api/manutenzioni/${data.spItemId}/allegato`,
            urlConferma: `/api/manutenzioni/${data.spItemId}/allegato`,
            metodoConferma: 'PUT',
            onAvanzamento: setAvanzamento,
          })
          esitoFoto = ' · foto allegata'
        } catch (e: any) {
          // La richiesta è partita: una foto mancata non la annulla, si dice e basta.
          esitoFoto = ` · ⚠️ la foto non è stata caricata (${e.message}): mandala nei messaggi della richiesta`
        } finally {
          setAvanzamento(null)
        }
      }

      setSuccess(`✅ Richiesta inviata: ${data.idRichiesta}${esitoFoto}`)
      setFoto(null)
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

      {/* Foto (facoltativa) */}
      {allegatiAttivi && (
        <div>
          <Allegato
            etichetta="Foto del problema"
            file={foto}
            onChange={setFoto}
            accetta="image/*"
            disabilitato={loading}
            aiuto="Facoltativa. Dal telefono puoi scattarla subito: aiuta chi interviene a capire il problema."
          />
          {avanzamento !== null && (
            <p className="text-xs text-gray-500 mt-1">Caricamento foto… {avanzamento}%</p>
          )}
        </div>
      )}

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
