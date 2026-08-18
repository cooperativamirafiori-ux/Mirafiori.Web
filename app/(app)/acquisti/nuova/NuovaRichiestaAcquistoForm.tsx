'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CentroDiCosto } from '@/lib/centri-costo/data'
import { CATEGORIE_SPESA, URGENZE } from '@/types/acquisti'

interface Iniziali {
  centroCostoId: string
  descrizione: string
  quantita: string
  link: string
  categoria: string
}

interface Props {
  centri: CentroDiCosto[]
  iniziali: Iniziali
}

const campoCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

export function NuovaRichiestaAcquistoForm({ centri, iniziali }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviata, setInviata] = useState<string | null>(null)

  const [form, setForm] = useState({
    centroCostoId: iniziali.centroCostoId,
    descrizione: iniziali.descrizione,
    quantita: iniziali.quantita || '1',
    link: iniziali.link,
    urgenza: 'Normale',
    serveEntro: '',
    categoria: iniziali.categoria,
  })

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function invia(e: React.FormEvent) {
    e.preventDefault()
    setErrore(null)

    if (!form.centroCostoId || !form.descrizione.trim() || !form.categoria) {
      setErrore('Compila centro di costo, descrizione e categoria.')
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/acquisti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          centroCostoId: Number(form.centroCostoId),
          descrizione: form.descrizione.trim(),
          quantita: Number(form.quantita) || 1,
          link: form.link.trim() || undefined,
          urgenza: form.urgenza,
          serveEntro: form.serveEntro || undefined,
          categoria: form.categoria,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore durante l’invio')
      setInviata(data.codice)
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  /** Mantiene centro di costo e categoria, azzera l'articolo: per chiedere più cose di fila. */
  function altroArticolo() {
    setInviata(null)
    setForm((f) => ({ ...f, descrizione: '', quantita: '1', link: '', serveEntro: '' }))
  }

  if (inviata) {
    return (
      <div className="bg-white rounded-2xl shadow p-6 text-center space-y-4">
        <div className="text-4xl">✅</div>
        <div>
          <p className="font-semibold text-gray-800">Richiesta inviata</p>
          <p className="text-sm text-gray-500 mt-1">
            Il codice è <strong className="font-mono">{inviata}</strong>. Ti avvisiamo via mail
            a ogni passaggio, fino alla consegna.
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={altroArticolo}
            className="w-full bg-brand-orange text-white py-2.5 rounded-lg text-sm font-semibold hover:opacity-90"
          >
            + Chiedi un altro articolo
          </button>
          <button
            onClick={() => router.push('/acquisti/mie')}
            className="w-full border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50"
          >
            Vedi le mie richieste
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={invia} className="bg-white rounded-2xl shadow p-6 space-y-5">
      {errore && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{errore}</div>}

      <div>
        <label className={labelCls}>Centro di costo *</label>
        <select
          value={form.centroCostoId}
          onChange={(e) => set('centroCostoId', e.target.value)}
          className={campoCls}
          required
        >
          <option value="">— Seleziona —</option>
          {centri.map((c) => (
            <option key={c.id} value={c.id}>
              {c.area ? `${c.area} · ${c.nome}` : c.nome}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">A chi viene imputata la spesa.</p>
      </div>

      <div>
        <label className={labelCls}>Cosa serve *</label>
        <textarea
          value={form.descrizione}
          onChange={(e) => set('descrizione', e.target.value)}
          className={`${campoCls} resize-none h-24`}
          placeholder="Es. Carta A4 bianca 80 g, risme da 500 fogli"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Quantità *</label>
          <input
            type="number"
            min={1}
            value={form.quantita}
            onChange={(e) => set('quantita', e.target.value)}
            className={campoCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Urgenza *</label>
          <select
            value={form.urgenza}
            onChange={(e) => set('urgenza', e.target.value)}
            className={campoCls}
            required
          >
            {URGENZE.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Categoria di spesa *</label>
        <select
          value={form.categoria}
          onChange={(e) => set('categoria', e.target.value)}
          className={campoCls}
          required
        >
          <option value="">— Seleziona —</option>
          {CATEGORIE_SPESA.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>
          Serve entro il <span className="text-gray-400 font-normal">— facoltativo</span>
        </label>
        <input
          type="date"
          value={form.serveEntro}
          onChange={(e) => set('serveEntro', e.target.value)}
          className={campoCls}
        />
      </div>

      <div>
        <label className={labelCls}>
          Link al prodotto <span className="text-gray-400 font-normal">— facoltativo</span>
        </label>
        <input
          type="url"
          value={form.link}
          onChange={(e) => set('link', e.target.value)}
          className={campoCls}
          placeholder="https://..."
        />
      </div>

      <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
        Il servizio dove consegnare la merce lo decide chi prende in carico la richiesta. Se deve
        arrivare in un posto preciso, scrivilo in <strong>Cosa serve</strong>.
      </p>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={() => router.push('/acquisti')}
          className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50"
        >
          ← Indietro
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex-1 bg-brand-orange text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:opacity-90"
        >
          {busy ? 'Invio…' : 'Invia richiesta'}
        </button>
      </div>
    </form>
  )
}
