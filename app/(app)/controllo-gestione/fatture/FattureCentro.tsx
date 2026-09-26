'use client'

/**
 * Due elenchi: le fatture ancora libere e quelle già segnate.
 *
 *  - **Libere**: si spuntano e si preme "Sono del mio servizio". Chi coordina
 *    più centri di costo sceglie quale. Vince il primo: se un collega l'ha
 *    presa un attimo prima, lo si dice invece di sovrascrivere.
 *  - **Segnate**: le proprie (o tutte, per il Controllo di Gestione), con
 *    "libera" per chi ha sbagliato — finché non è stata pagata.
 *
 * Il suggerimento "di solito: …" viene dalle altre fatture dello stesso
 * fornitore già attribuite. È un aiuto, non una decisione: non preseleziona.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Pill } from '@/components/ui/Pill'
import { Vuoto } from '@/components/ui/Vuoto'
import type { FatturaDaSegnare } from '@/lib/pagamenti/assegnazione'

interface Dati {
  libere: FatturaDaSegnare[]
  segnate: FatturaDaSegnare[]
  centri: Array<{ codice: string; nome: string }>
  nomi: Record<string, string>
  tutti: boolean
}

const euro = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const dataIt = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('it-IT') : '—')

export function FattureCentro({ email }: { email: string }) {
  const [dati, setDati] = useState<Dati | null>(null)
  const [vista, setVista] = useState<'libere' | 'segnate'>('libere')
  const [cerca, setCerca] = useState('')
  const [scelte, setScelte] = useState<Set<string>>(new Set())
  const [cc, setCc] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/centri-costo/fatture')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Errore di lettura')
      setDati(j)
      if (j.centri.length === 1) setCc(j.centri[0].codice)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di lettura')
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  useEffect(() => setScelte(new Set()), [vista])

  const righe = useMemo(() => {
    if (!dati) return []
    const base = vista === 'libere' ? dati.libere : dati.segnate
    const q = cerca.trim().toLowerCase()
    if (!q) return base
    return base.filter((f) =>
      [f.fornitore, f.numero, f.descrizione, f.piva].some((x) => x?.toLowerCase().includes(q)),
    )
  }, [dati, vista, cerca])

  const nomeCc = (c: string) => dati?.nomi[c] ?? c

  async function invia(metodo: 'POST' | 'DELETE', corpo: Record<string, unknown>) {
    setInCorso(true)
    setErrore('')
    setMessaggio('')
    try {
      const res = await fetch('/api/centri-costo/fatture', {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Operazione non riuscita')
      if (metodo === 'POST') {
        setMessaggio(
          `${j.segnate} ${j.segnate === 1 ? 'fattura segnata' : 'fatture segnate'} su ${nomeCc(String(corpo.cc))}` +
            (j.giaPrese > 0 ? ` · ${j.giaPrese} le aveva già prese un collega` : ''),
        )
      } else {
        setMessaggio(
          `${j.liberate} ${j.liberate === 1 ? 'fattura liberata' : 'fatture liberate'}` +
            (j.ignorate?.length ? ` · ${j.ignorate.length} no: ${j.ignorate[0].motivo}` : ''),
        )
      }
      setScelte(new Set())
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione non riuscita')
    } finally {
      setInCorso(false)
    }
  }

  const toggle = (id: string) =>
    setScelte((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  if (!dati) {
    return errore ? <Banner tono="errore">{errore}</Banner> : <p className="text-sm text-gray-500">Caricamento…</p>
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Fatture del servizio</h2>
        <p className="text-sm text-gray-500">
          Spunta le fatture che sono del tuo servizio. Vale il primo che le prende: se sbagli, puoi
          liberarle finché non sono pagate.
        </p>
      </div>

      <Banner tono="errore">{errore}</Banner>
      <Banner tono="ok">{messaggio}</Banner>

      <div className="flex flex-wrap gap-2">
        <Tab attivo={vista === 'libere'} onClick={() => setVista('libere')}>
          Libere ({dati.libere.length})
        </Tab>
        <Tab attivo={vista === 'segnate'} onClick={() => setVista('segnate')}>
          {dati.tutti ? 'Segnate' : 'Del mio servizio'} ({dati.segnate.length})
        </Tab>
      </div>

      <input
        value={cerca}
        onChange={(e) => setCerca(e.target.value)}
        placeholder="Cerca fornitore, numero, descrizione…"
        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
      />

      {righe.length === 0 ? (
        <Vuoto>{vista === 'libere' ? 'Nessuna fattura libera.' : 'Nessuna fattura segnata.'}</Vuoto>
      ) : (
        <ul className="space-y-2">
          {righe.map((f) => (
            <li
              key={f.id}
              className={`flex items-start gap-3 rounded-xl border bg-white px-3 py-3 ${
                scelte.has(f.id) ? 'border-slate-400' : 'border-gray-200'
              }`}
            >
              {(vista === 'libere' || !f.bloccata || dati.tutti) && (
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0"
                  checked={scelte.has(f.id)}
                  onChange={() => toggle(f.id)}
                  aria-label={`Seleziona ${f.fornitore} ${f.numero ?? ''}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-800 break-words">{f.fornitore}</span>
                  {f.notaCredito && <Pill text="nota di credito" tono="viola" />}
                  {vista === 'segnate' && f.cc && <Pill text={nomeCc(f.cc)} tono="azzurro" />}
                  {vista === 'segnate' && f.bloccata && <Pill text="pagata" tono="verde" />}
                </div>
                <p className="text-sm text-gray-500">
                  {f.numero ? `n. ${f.numero}` : 'senza numero'} del {dataIt(f.data)}
                </p>
                {f.descrizione && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{f.descrizione}</p>}
                {vista === 'libere' && f.suggeriti.length > 0 && (
                  <p className="text-xs text-cyan-700 mt-0.5">di solito: {f.suggeriti.map(nomeCc).join(', ')}</p>
                )}
                {vista === 'segnate' && f.segnataDa && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {f.segnataDa === email ? 'segnata da te' : `segnata da ${f.segnataDa}`} il {dataIt(f.segnataIl)}
                  </p>
                )}
                {f.pdfUrl && (
                  <a
                    href={f.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-600 underline underline-offset-2"
                  >
                    Apri il PDF
                  </a>
                )}
              </div>
              <p className="font-bold text-gray-800 shrink-0">{euro(f.totale)}</p>
            </li>
          ))}
        </ul>
      )}

      {scelte.size > 0 && vista === 'libere' && (
        <Barra>
          {dati.centri.length > 1 && (
            <select
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="w-full sm:w-auto rounded-lg border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">Scegli il servizio…</option>
              {dati.centri.map((c) => (
                <option key={c.codice} value={c.codice}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => void invia('POST', { ids: [...scelte], cc })}
            disabled={inCorso || !cc}
            className="w-full sm:w-auto rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {dati.centri.length === 1 ? `Sono di ${dati.centri[0].nome}` : 'Sono del mio servizio'} ({scelte.size})
          </button>
        </Barra>
      )}

      {scelte.size > 0 && vista === 'segnate' && (
        <Barra>
          <button
            onClick={() => void invia('DELETE', { ids: [...scelte] })}
            disabled={inCorso}
            className="w-full sm:w-auto rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40"
          >
            Libera ({scelte.size})
          </button>
        </Barra>
      )}
    </div>
  )
}

function Tab({ attivo, onClick, children }: { attivo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold border ${
        attivo ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function Barra({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-3 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
      {children}
    </div>
  )
}
