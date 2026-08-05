'use client'

import { useState } from 'react'
import { ESITI_CONSEGNA, type EsitoConsegna } from '@/types/acquisti'

interface Props {
  token: string
  esitoIniziale: EsitoConsegna
  codice: string
  descrizione: string
  quantita: number
  fornitore: string
  luogo: string
  dataPrevista: string
}

const STILE: Record<EsitoConsegna, { attivo: string; emoji: string; nota: string }> = {
  'Tutto ok': {
    attivo: 'bg-emerald-600 text-white border-emerald-600',
    emoji: '✅',
    nota: 'La richiesta viene chiusa e la spesa registrata.',
  },
  'Da restituire': {
    attivo: 'bg-orange-500 text-white border-orange-500',
    emoji: '↩️',
    nota: 'Avvisiamo chi ha fatto l’ordine, che si occuperà del reso.',
  },
}

export function ConfermaConsegna(props: Props) {
  const [esito, setEsito] = useState<EsitoConsegna>(props.esitoIniziale)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [fatto, setFatto] = useState(false)

  async function conferma() {
    setBusy(true)
    setErrore(null)
    try {
      const res = await fetch(`/api/consegna/${props.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esito, note: note.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Non è stato possibile registrare la risposta')
      setFatto(true)
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (fatto) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 text-center">
        <p className="text-4xl mb-3">{STILE[esito].emoji}</p>
        <p className="font-semibold text-gray-800">Grazie, registrato</p>
        <p className="text-sm text-gray-500 mt-1">
          Hai indicato «{esito}» per la richiesta{' '}
          <strong className="font-mono">{props.codice}</strong>. {STILE[esito].nota}
        </p>
        <p className="text-xs text-gray-400 mt-4">Puoi chiudere questa pagina.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
      <div>
        <p className="text-xs font-mono text-gray-400">{props.codice}</p>
        <h1 className="text-lg font-bold text-gray-800 mt-0.5">Com’è andata la consegna?</h1>
      </div>

      <dl className="text-sm bg-gray-50 rounded-xl px-4 py-3 space-y-1">
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500 shrink-0">Cosa</dt>
          <dd className="text-gray-800 font-medium text-right">
            {props.descrizione}
            {props.quantita > 1 ? ` ×${props.quantita}` : ''}
          </dd>
        </div>
        {props.fornitore && (
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500 shrink-0">Fornitore</dt>
            <dd className="text-gray-800 text-right">{props.fornitore}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500 shrink-0">Consegna a</dt>
          <dd className="text-gray-800 text-right">{props.luogo}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500 shrink-0">Prevista per</dt>
          <dd className="text-gray-800 text-right">{props.dataPrevista}</dd>
        </div>
      </dl>

      <div className="space-y-2">
        {ESITI_CONSEGNA.map((e) => {
          const attivo = esito === e
          return (
            <button
              key={e}
              onClick={() => setEsito(e)}
              className={`w-full flex items-center gap-3 border rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                attivo ? STILE[e].attivo : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className="text-lg">{STILE[e].emoji}</span>
              <span>{e}</span>
              {attivo && <span className="ml-auto text-xs font-normal opacity-80">selezionato</span>}
            </button>
          )
        })}
      </div>

      {esito !== 'Tutto ok' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Cosa è successo? <span className="text-gray-400 font-normal">— aiuta a risolvere</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-brand-orange"
            placeholder="Es. sono arrivate 3 risme invece di 5"
          />
        </div>
      )}

      {errore && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{errore}</div>}

      <button
        onClick={conferma}
        disabled={busy}
        className="w-full bg-brand-cyan-dark text-white py-3 rounded-xl font-semibold disabled:opacity-50"
      >
        {busy ? 'Registro…' : 'Conferma'}
      </button>
      <p className="text-xs text-gray-400 text-center">{STILE[esito].nota}</p>
    </div>
  )
}
