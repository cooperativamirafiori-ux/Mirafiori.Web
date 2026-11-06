'use client'

/**
 * Casella "Addebita un costo" della home, sotto la Timbratura (Dennis,
 * 06/11/2026). Solo per gli account in ADDEBITO_RAPIDO (oggi la Locanda):
 * oggetto + prezzo + centro di costo, niente ore. Crea un normale addebito
 * interno (Controllo di Gestione → Addebiti interni) nel mese aperto, con una
 * sola riga di "altri costi".
 */

import { useState } from 'react'
import { meseDiAddebito } from '@/lib/servizi-interni/flusso'
import type { CentroScelta } from '@/types/servizi-interni'

export function AddebitoRapidoCard({ ccDa, centri }: { ccDa: string; centri: CentroScelta[] }) {
  const [ccA, setCcA] = useState('')
  const [oggetto, setOggetto] = useState('')
  const [prezzo, setPrezzo] = useState('')
  const [invio, setInvio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [fatto, setFatto] = useState<string | null>(null)

  const destinazioni = centri.filter((c) => c.codice !== ccDa)
  const importo = Number(prezzo.replace(/\./g, '').replace(',', '.'))

  async function salva(e: React.FormEvent) {
    e.preventDefault()
    setErrore(null)
    setFatto(null)
    if (!ccA) return setErrore('Scegli il centro di costo')
    if (!oggetto.trim()) return setErrore('Scrivi cosa addebiti')
    if (!(importo > 0)) return setErrore('Scrivi un prezzo maggiore di zero')
    setInvio(true)
    try {
      const oggi = new Date().toISOString().slice(0, 10)
      const r = await fetch('/api/servizi-interni/addebiti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ccDa,
          ccA,
          mese: meseDiAddebito(oggi),
          descrizione: oggetto.trim(),
          ore: 0,
          altriCosti: [{ descrizione: oggetto.trim(), importo }],
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? 'Salvataggio non riuscito')
      const nome = centri.find((c) => c.codice === ccA)?.nome ?? ccA
      setFatto(`Fatto: ${importo.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} addebitati a ${nome}`)
      setOggetto('')
      setPrezzo('')
      setCcA('')
    } catch (e: any) {
      setErrore(e.message ?? 'Errore')
    } finally {
      setInvio(false)
    }
  }

  return (
    <form onSubmit={salva} className="mt-3 rounded-2xl border border-brand-cyan-dark/30 bg-white p-4 shadow-sm">
      <h2 className="font-bold text-gray-800">💶 Addebita un costo a un centro di costo</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_8rem]">
        <select
          value={ccA}
          onChange={(e) => setCcA(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-base bg-white"
        >
          <option value="">Centro di costo…</option>
          {destinazioni.map((c) => (
            <option key={c.codice} value={c.codice}>
              {c.nome} ({c.codice})
            </option>
          ))}
        </select>
        <input
          value={oggetto}
          onChange={(e) => setOggetto(e.target.value)}
          placeholder="Oggetto (es. 20 pasti)"
          maxLength={300}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-base"
        />
        <input
          value={prezzo}
          onChange={(e) => setPrezzo(e.target.value)}
          placeholder="Prezzo €"
          inputMode="decimal"
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-base"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={invio}
          className="rounded-lg bg-brand-cyan-dark px-5 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {invio ? 'Salvo…' : 'Addebita'}
        </button>
        {errore && <span className="text-sm text-red-600">{errore}</span>}
        {fatto && <span className="text-sm text-emerald-700">{fatto}</span>}
      </div>
    </form>
  )
}
