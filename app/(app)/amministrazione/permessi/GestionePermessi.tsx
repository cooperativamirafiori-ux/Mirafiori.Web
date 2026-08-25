'use client'

/**
 * Gestione accessi: elenco delle persone a sinistra, aree della persona scelta
 * a destra.
 *
 * La versione precedente stampava, per ogni persona, una card con tutte le aree
 * come piastrelle: con quattro aree e una ventina di persone diventavano ottanta
 * riquadri in colonna e non si capiva più chi avesse cosa. Qui si legge una
 * persona per volta, e la domanda opposta («chi entra in Acquisti?») ha la sua
 * vista nel secondo tab.
 *
 * Le modifiche restano immediate: nessun pulsante "salva", ogni interruttore è
 * una chiamata sola all'API.
 */

import { useMemo, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Vuoto } from '@/components/ui/Vuoto'
import { SceltaPersona, type VoceRubrica } from './SceltaPersona'
import { VistaPerArea } from './VistaPerArea'

interface Autorizzazione {
  id: string
  utente: string
  area: string
}

interface Props {
  aree: string[]
  descrizioni: Record<string, string>
  iniziali: Autorizzazione[]
  /** Account della cooperativa, per l'autocompletamento. Può essere vuota. */
  rubrica: VoceRubrica[]
}

export function GestionePermessi({ aree, descrizioni, iniziali, rubrica }: Props) {
  // Mappa utente -> { area -> idRiga }. Unica fonte di verità della schermata.
  const [perm, setPerm] = useState<Record<string, Record<string, string>>>(() => {
    const m: Record<string, Record<string, string>> = {}
    for (const a of iniziali) (m[a.utente.toLowerCase()] ??= {})[a.area] = a.id
    return m
  })
  // Persone aggiunte in questa sessione che non hanno ancora nessuna area:
  // senza questo elenco sparirebbero dalla lista appena aggiunte.
  const [senzaAree, setSenzaAree] = useState<string[]>([])
  const [selezionato, setSelezionato] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')
  const [vista, setVista] = useState<'persone' | 'aree'>('persone')
  const [busy, setBusy] = useState<string | null>(null) // "utente|area" in corso
  const [errore, setErrore] = useState<string | null>(null)

  const nomi = useMemo(() => {
    const m: Record<string, string> = {}
    for (const v of rubrica) m[v.email] = v.nome
    return m
  }, [rubrica])

  const utenti = useMemo(() => {
    const set = new Set<string>([...Object.keys(perm), ...senzaAree])
    return Array.from(set).sort((a, b) => (nomi[a] ?? a).localeCompare(nomi[b] ?? b, 'it'))
  }, [perm, senzaAree, nomi])

  const visibili = useMemo(() => {
    const q = filtro.toLowerCase().trim()
    if (!q) return utenti
    return utenti.filter((u) => u.includes(q) || (nomi[u] ?? '').toLowerCase().includes(q))
  }, [utenti, filtro, nomi])

  async function toggle(utente: string, area: string) {
    if (busy) return
    setErrore(null)
    setBusy(`${utente}|${area}`)
    const idEsistente = perm[utente]?.[area]
    try {
      if (idEsistente) {
        const res = await fetch(`/api/permessi/${idEsistente}`, { method: 'DELETE' })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Errore revoca')
        setPerm((prev) => {
          const next = { ...prev, [utente]: { ...prev[utente] } }
          delete next[utente][area]
          return next
        })
        // Rimasto senza aree: resta in elenco finché la pagina è aperta, così
        // chi ha appena tolto un permesso per sbaglio lo ritrova dov'era.
        setSenzaAree((prev) => (prev.includes(utente) ? prev : [...prev, utente]))
      } else {
        const res = await fetch('/api/permessi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ utente, area }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Errore salvataggio')
        const { autorizzazione } = await res.json()
        setPerm((prev) => ({ ...prev, [utente]: { ...prev[utente], [area]: autorizzazione.id } }))
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(null)
    }
  }

  function aggiungiPersona(v: VoceRubrica) {
    setErrore(null)
    const email = v.email.toLowerCase()
    if (!utenti.includes(email)) setSenzaAree((prev) => [...prev, email])
    setSelezionato(email)
    setVista('persone')
    setFiltro('')
  }

  const areeDi = (u: string) => aree.filter((a) => !!perm[u]?.[a])

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 text-sm font-semibold">
        {(['persone', 'aree'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVista(v)}
            aria-pressed={vista === v}
            className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${
              vista === v ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {v === 'persone' ? 'Per persona' : 'Per area'}
          </button>
        ))}
      </div>

      <Banner tono="errore">{errore}</Banner>

      {vista === 'aree' ? (
        <VistaPerArea
          aree={aree}
          descrizioni={descrizioni}
          perm={perm}
          nomi={nomi}
          busy={busy}
          onRevoca={toggle}
          onApriPersona={(u) => {
            setSelezionato(u)
            setVista('persone')
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[19rem_1fr] md:items-start">
          {/* ── Elenco persone ── */}
          <div
            className={`space-y-3 ${selezionato ? 'hidden md:block' : ''}`}
          >
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                Aggiungi una persona
              </label>
              <SceltaPersona
                rubrica={rubrica}
                giaPresenti={utenti}
                onScegli={aggiungiPersona}
              />
              {rubrica.length === 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Rubrica aziendale non disponibile: scrivi l&apos;email per intero.
                </p>
              )}
            </div>

            <input
              type="search"
              placeholder="Filtra l’elenco…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />

            {visibili.length === 0 ? (
              <Vuoto>
                {utenti.length === 0
                  ? 'Nessuno ha ancora un accesso. Aggiungi una persona qui sopra.'
                  : 'Nessuna persona corrisponde al filtro.'}
              </Vuoto>
            ) : (
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                {visibili.map((u) => {
                  const n = areeDi(u).length
                  const attivo = selezionato === u
                  return (
                    <li key={u}>
                      <button
                        type="button"
                        onClick={() => setSelezionato(u)}
                        aria-current={attivo}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                          attivo ? 'bg-slate-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold uppercase text-slate-600">
                          {(nomi[u] ?? u).charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-800">
                            {nomi[u] ?? u}
                          </span>
                          <span className="block truncate text-xs text-gray-400">{u}</span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            n === 0 ? 'bg-gray-100 text-gray-400' : 'bg-slate-600 text-white'
                          }`}
                        >
                          {n}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* ── Aree della persona scelta ── */}
          <div className={selezionato ? '' : 'hidden md:block'}>
            {!selezionato ? (
              <Vuoto>Scegli una persona dall&apos;elenco per vedere i suoi accessi.</Vuoto>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <button
                  type="button"
                  onClick={() => setSelezionato(null)}
                  className="mb-3 text-sm font-semibold text-slate-600 md:hidden"
                >
                  ← Elenco persone
                </button>

                <div className="mb-4 flex items-center gap-3 border-b border-gray-100 pb-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base font-bold uppercase text-slate-600">
                    {(nomi[selezionato] ?? selezionato).charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-gray-800">
                      {nomi[selezionato] ?? selezionato}
                    </p>
                    <p className="truncate text-sm text-gray-400">{selezionato}</p>
                  </div>
                </div>

                <ul className="space-y-2">
                  {aree.map((area) => {
                    const attivo = !!perm[selezionato]?.[area]
                    const inCorso = busy === `${selezionato}|${area}`
                    return (
                      <li key={area}>
                        <button
                          type="button"
                          onClick={() => toggle(selezionato, area)}
                          disabled={!!busy}
                          aria-pressed={attivo}
                          className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all disabled:opacity-60 ${
                            attivo
                              ? 'border-slate-600 bg-slate-50 ring-1 ring-slate-600'
                              : 'border-gray-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              attivo ? 'bg-slate-600 text-white' : 'bg-gray-100 text-gray-300'
                            }`}
                          >
                            {inCorso ? '…' : attivo ? '✓' : ''}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-gray-800">
                              {area}
                            </span>
                            {descrizioni[area] && (
                              <span className="mt-0.5 block text-xs text-gray-500">
                                {descrizioni[area]}
                              </span>
                            )}
                          </span>
                          <span
                            className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${
                              attivo ? 'text-slate-600' : 'text-gray-300'
                            }`}
                          >
                            {attivo ? 'Attivo' : 'Spento'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
