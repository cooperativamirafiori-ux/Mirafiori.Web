'use client'

import { useMemo, useState } from 'react'

interface Autorizzazione {
  id: string
  utente: string
  area: string
}

interface Props {
  aree: string[]
  iniziali: Autorizzazione[]
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function GestionePermessi({ aree, iniziali }: Props) {
  // Mappa utente -> { area -> idRiga }
  const [perm, setPerm] = useState<Record<string, Record<string, string>>>(() => {
    const m: Record<string, Record<string, string>> = {}
    for (const a of iniziali) {
      const u = a.utente.toLowerCase()
      ;(m[u] ??= {})[a.area] = a.id
    }
    return m
  })
  // Utenti senza alcun permesso, aggiunti localmente in questa sessione
  const [utentiVuoti, setUtentiVuoti] = useState<string[]>([])
  const [nuovaEmail, setNuovaEmail] = useState('')
  const [busy, setBusy] = useState<string | null>(null) // chiave "utente|area" in corso
  const [errore, setErrore] = useState<string | null>(null)

  const utenti = useMemo(() => {
    const set = new Set<string>([...Object.keys(perm), ...utentiVuoti])
    return Array.from(set).sort()
  }, [perm, utentiVuoti])

  async function toggle(utente: string, area: string) {
    const chiave = `${utente}|${area}`
    if (busy) return
    setErrore(null)
    setBusy(chiave)
    const idEsistente = perm[utente]?.[area]
    try {
      if (idEsistente) {
        // Revoca
        const res = await fetch(`/api/permessi/${idEsistente}`, { method: 'DELETE' })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Errore revoca')
        setPerm((prev) => {
          const next = { ...prev, [utente]: { ...prev[utente] } }
          delete next[utente][area]
          return next
        })
      } else {
        // Concedi
        const res = await fetch('/api/permessi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ utente, area }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Errore salvataggio')
        const { autorizzazione } = await res.json()
        setPerm((prev) => ({
          ...prev,
          [utente]: { ...prev[utente], [area]: autorizzazione.id },
        }))
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(null)
    }
  }

  function aggiungiUtente() {
    const e = nuovaEmail.toLowerCase().trim()
    setErrore(null)
    if (!EMAIL_RE.test(e)) {
      setErrore('Inserisci un indirizzo email valido.')
      return
    }
    if (utenti.includes(e)) {
      setErrore('Questo utente è già in elenco.')
      return
    }
    setUtentiVuoti((prev) => [...prev, e])
    setNuovaEmail('')
  }

  return (
    <div className="space-y-6">
      {/* Aggiungi utente */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-800 mb-1">Aggiungi una persona</h3>
        <p className="text-sm text-gray-500 mb-3">
          Inserisci l&apos;email aziendale, poi attiva le aree con un click sulle card.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            inputMode="email"
            placeholder="nome.cognome@cooperativamirafiori.com"
            value={nuovaEmail}
            onChange={(e) => setNuovaEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && aggiungiUtente()}
            className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <button
            onClick={aggiungiUtente}
            className="bg-slate-700 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors"
          >
            + Aggiungi
          </button>
        </div>
      </div>

      {errore && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {errore}
        </div>
      )}

      {/* Elenco utenti con card area */}
      {utenti.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-400">
          Nessun utente con permessi. Aggiungine uno qui sopra.
        </div>
      ) : (
        <div className="space-y-4">
          {utenti.map((utente) => (
            <div
              key={utente}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold uppercase">
                  {utente[0]}
                </span>
                <span className="font-semibold text-gray-800 break-all">{utente}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {aree.map((area) => {
                  const attivo = !!perm[utente]?.[area]
                  const inCorso = busy === `${utente}|${area}`
                  return (
                    <button
                      key={area}
                      onClick={() => toggle(utente, area)}
                      disabled={inCorso}
                      aria-pressed={attivo}
                      className={`relative rounded-xl border p-3 text-left transition-all disabled:opacity-60 ${
                        attivo
                          ? 'border-slate-600 bg-slate-50 ring-1 ring-slate-600'
                          : 'border-gray-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span
                        className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                          attivo ? 'bg-slate-600 text-white' : 'bg-gray-100 text-gray-300'
                        }`}
                      >
                        {inCorso ? '…' : attivo ? '✓' : ''}
                      </span>
                      <span className="block font-semibold text-sm text-gray-800 pr-6">
                        {area}
                      </span>
                      <span className="block text-xs text-gray-400 mt-0.5">
                        {attivo ? 'Attivo' : 'Disattivato'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
