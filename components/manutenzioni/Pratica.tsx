'use client'

/**
 * La parte "pratica" della finestra di una richiesta di manutenzione: cose da
 * fare + conversazione. La stessa per le due parti, cambia `come`:
 *
 * - `gestione` (Pannello di controllo): spunta e toglie le righe;
 * - `richiedente` (Le mie richieste): aggiunge righe e scrive, non spunta.
 *
 * Si carica quando la finestra si apre, e aprirla segna come letti i messaggi
 * dell'altra parte. Piano: docs/manutenzioni-piano.md.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatoPratica, MessaggioPratica, Pratica as DatiPratica, VocePratica } from '@/types/manutenzioni'
import { Banner } from '@/components/ui/Banner'

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50'

function quando(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const ETICHETTA_TIPO: Record<MessaggioPratica['tipo'], string | null> = {
  messaggio: null,
  presa_in_carico: 'Presa in carico',
  tecnico_assegnato: 'Tecnico assegnato',
  chiusura: 'Chiusura',
}

export function Pratica({
  spItemId,
  come,
  completata,
  onLetti,
}: {
  spItemId: string
  come: LatoPratica
  completata: boolean
  /** Chiamata dopo il caricamento: i messaggi dell'altra parte ora sono letti. */
  onLetti?: () => void
}) {
  const [dati, setDati] = useState<DatiPratica | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [testo, setTesto] = useState('')
  const [nuovaVoce, setNuovaVoce] = useState('')
  const [invio, setInvio] = useState(false)
  const fondo = useRef<HTMLDivElement>(null)

  const carica = useCallback(async () => {
    try {
      const res = await fetch(`/api/manutenzioni/${encodeURIComponent(spItemId)}/pratica?come=${come}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Errore')
      setDati(j)
      onLetti?.()
    } catch (e: any) {
      setErrore(`Non riesco a caricare la conversazione: ${e.message}`)
    }
  }, [spItemId, come, onLetti])

  useEffect(() => { carica() }, [carica])

  async function chiama(url: string, metodo: string, corpo?: unknown) {
    const res = await fetch(url, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error ?? 'Errore')
    return j
  }

  const base = `/api/manutenzioni/${encodeURIComponent(spItemId)}`

  async function invia() {
    const t = testo.trim()
    if (!t) return
    setInvio(true); setErrore(null)
    try {
      const j = await chiama(`${base}/pratica`, 'POST', { come, testo: t })
      setDati((d) => d && { ...d, messaggi: [...d.messaggi, j.messaggio as MessaggioPratica] })
      setTesto('')
      setTimeout(() => fondo.current?.scrollIntoView({ block: 'nearest' }), 50)
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setInvio(false)
    }
  }

  async function aggiungiVoce() {
    const t = nuovaVoce.trim()
    if (!t) return
    setInvio(true); setErrore(null)
    try {
      const j = await chiama(`${base}/voci`, 'POST', { come, testo: t })
      setDati((d) => d && { ...d, voci: [...d.voci, j.voce as VocePratica] })
      setNuovaVoce('')
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setInvio(false)
    }
  }

  async function spunta(v: VocePratica) {
    setErrore(null)
    try {
      const j = await chiama(`${base}/voci/${v.id}`, 'PATCH', { fatta: !v.fatta })
      setDati((d) => d && { ...d, voci: d.voci.map((x) => (x.id === v.id ? (j.voce as VocePratica) : x)) })
    } catch (e: any) {
      setErrore(e.message)
    }
  }

  async function togli(v: VocePratica) {
    setErrore(null)
    try {
      await chiama(`${base}/voci/${v.id}`, 'DELETE')
      setDati((d) => d && { ...d, voci: d.voci.filter((x) => x.id !== v.id) })
    } catch (e: any) {
      setErrore(e.message)
    }
  }

  const gestione = come === 'gestione'
  const voci = dati?.voci ?? []
  const fatte = voci.filter((v) => v.fatta).length

  return (
    <div className="space-y-4">
      <Banner tono="errore">{errore}</Banner>

      {/* ── Cose da fare ── */}
      <section className="bg-white rounded-lg border border-gray-200 p-3 space-y-2" aria-label="Cose da fare">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Cose da fare</p>
          {voci.length > 0 && <span className="text-xs text-gray-500">{fatte} di {voci.length} fatte</span>}
        </div>

        {!dati && !errore && <p className="text-sm text-gray-400">Caricamento…</p>}
        {dati && voci.length === 0 && (
          <p className="text-sm text-gray-400">
            {completata ? 'Nessuna riga.' : 'Nessuna riga. Se la richiesta contiene più lavori, scrivili qui uno per riga.'}
          </p>
        )}

        <ul className="space-y-1.5">
          {voci.map((v) => (
            <li key={v.id} className="flex items-start gap-2">
              {gestione ? (
                <input
                  type="checkbox"
                  checked={v.fatta}
                  onChange={() => spunta(v)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                  aria-label={`Fatto: ${v.testo}`}
                />
              ) : (
                <span className={`mt-0.5 h-5 w-5 shrink-0 rounded border flex items-center justify-center text-xs ${v.fatta ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300'}`} aria-hidden>
                  {v.fatta ? '✓' : ''}
                </span>
              )}
              <span className="flex-1 text-sm break-words">
                <span className={v.fatta ? 'text-gray-400 line-through' : 'text-gray-700'}>{v.testo}</span>
                {v.fatta && v.fattaIl && <span className="text-xs text-gray-400"> · fatto il {new Date(v.fattaIl).toLocaleDateString('it-IT')}</span>}
              </span>
              {gestione && (
                <button onClick={() => togli(v)} className="text-xs text-gray-400 hover:text-red-600 px-1" aria-label={`Togli: ${v.testo}`}>
                  Togli
                </button>
              )}
            </li>
          ))}
        </ul>

        {!completata && dati && (
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <input
              value={nuovaVoce}
              onChange={(e) => setNuovaVoce(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aggiungiVoce() } }}
              className={`${inputCls} flex-1 min-w-0`}
              placeholder="Es. cambiare la lampadina in camera 2"
              maxLength={300}
              disabled={invio}
            />
            <button
              onClick={aggiungiVoce}
              disabled={invio || !nuovaVoce.trim()}
              className="px-3 py-2 border border-primary text-primary text-sm rounded-lg disabled:opacity-40 hover:bg-primary hover:text-white w-full sm:w-auto"
            >
              Aggiungi
            </button>
          </div>
        )}
      </section>

      {/* ── Messaggi ── */}
      <section className="bg-white rounded-lg border border-gray-200 p-3 space-y-3" aria-label="Messaggi">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Messaggi</p>

        {dati && dati.messaggi.length === 0 && (
          <p className="text-sm text-gray-400">
            {gestione ? 'Nessun messaggio. Quello che scrivi arriva per mail al richiedente.' : 'Nessun messaggio. Se scrivi qui, arriva una mail a chi gestisce le manutenzioni.'}
          </p>
        )}

        <div className="space-y-2">
          {dati?.messaggi.map((m) => {
            const mio = m.lato === come
            const etichetta = ETICHETTA_TIPO[m.tipo]
            return (
              <div key={m.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${mio ? 'bg-primary/10 text-gray-800' : 'bg-gray-100 text-gray-800'}`}>
                  <p className="text-xs text-gray-500 mb-0.5">
                    <span className="font-semibold text-gray-600">{m.autoreNome}</span>
                    {' · '}{quando(m.creatoIl)}
                    {etichetta && <span className="ml-1 rounded-full bg-white/70 border border-gray-200 px-1.5">{etichetta}</span>}
                  </p>
                  <p className="whitespace-pre-line break-words">{m.testo}</p>
                </div>
              </div>
            )
          })}
          <div ref={fondo} />
        </div>

        {dati && (
          <div className="space-y-2">
            <textarea
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              className={`${inputCls} resize-none h-20`}
              placeholder={gestione ? 'Scrivi al richiedente…' : 'Scrivi a chi gestisce le manutenzioni…'}
              maxLength={4000}
              disabled={invio}
            />
            <div className="flex justify-end">
              <button
                onClick={invia}
                disabled={invio || !testo.trim()}
                className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-primary-dark w-full sm:w-auto"
              >
                {invio ? 'Invio…' : 'Invia messaggio'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
