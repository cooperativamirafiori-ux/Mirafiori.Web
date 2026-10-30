'use client'

/**
 * Responsabili d'area e coordinatori dei centri di costo, in due viste:
 *   - per area: ogni area con il suo responsabile e i suoi centri, modificabili;
 *   - per persona: chi ha quali ruoli, in sola lettura, per controllare.
 *
 * Ogni modifica si salva subito e torna l'anagrafica intera riletta da
 * SharePoint: quello che si vede dopo un salvataggio è quello che c'è davvero.
 */

import { useMemo, useState } from 'react'
import type { VoceRubrica } from '@/components/ui/SceltaPersona'
import type { RuoliCentro } from '@/lib/centri-costo/data'
import { Banner } from '@/components/ui/Banner'
import { Kpi } from '@/components/ui/Kpi'
import { Vuoto } from '@/components/ui/Vuoto'
import { Persone } from './Persone'
import { perArea, perPersona, riepilogo } from './raggruppa'

type Vista = 'area' | 'persona'

export function ResponsabiliCentri({
  iniziali,
  mancantiIniziali,
  erroreIniziale,
  rubrica,
}: {
  iniziali: RuoliCentro[]
  mancantiIniziali: string[]
  erroreIniziale: string
  rubrica: VoceRubrica[]
}) {
  const [centri, setCentri] = useState(iniziali)
  const [mancanti, setMancanti] = useState(mancantiIniziali)
  const [errore, setErrore] = useState(erroreIniziale)
  const [conferma, setConferma] = useState('')
  const [occupato, setOccupato] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('area')
  const [conSpenti, setConSpenti] = useState(false)

  const nomi = useMemo(() => new Map(rubrica.map((v) => [v.email, v.nome])), [rubrica])
  const nome = (e: string) => nomi.get(e) ?? e
  const aree = useMemo(() => perArea(centri, conSpenti), [centri, conSpenti])
  const persone = useMemo(() => perPersona(centri, nome), [centri, nomi]) // eslint-disable-line react-hooks/exhaustive-deps
  const conti = useMemo(() => riepilogo(centri), [centri])
  const bloccato = mancanti.length > 0

  async function salva(chiave: string, corpo: Record<string, unknown>, fatto: string) {
    setOccupato(chiave)
    setErrore('')
    setConferma('')
    try {
      const res = await fetch('/api/centri-costo/ruoli', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const dati = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(dati.error || 'Salvataggio non riuscito')
      setCentri(dati.centri)
      setMancanti(dati.mancanti ?? [])
      setConferma(fatto)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Salvataggio non riuscito')
    } finally {
      setOccupato(null)
    }
  }

  return (
    <div className="space-y-5">
      {bloccato && (
        <Banner tono="avviso">
          Sulla lista Centri di Costo mancano ancora le colonne per salvare ({mancanti.join(', ')}).
          Si creano con lo script di allineamento: finché non c&apos;è, qui si può solo guardare.
        </Banner>
      )}
      {/* In cima ma appiccicati: chi salva in fondo alla pagina, dal telefono, deve vederli. */}
      {(errore || conferma) && (
        <div className="sticky top-2 z-30 space-y-2">
          <Banner tono="errore">{errore}</Banner>
          <Banner tono="ok">{conferma}</Banner>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Kpi
          titolo="Aree senza responsabile"
          valore={conti.areeSenzaResponsabile}
          dimensione="lg"
          accento={conti.areeSenzaResponsabile ? 'amber' : 'emerald'}
        />
        <Kpi
          titolo="Servizi senza coordinatore"
          valore={conti.centriSenzaCoordinatore}
          dimensione="lg"
          accento={conti.centriSenzaCoordinatore ? 'amber' : 'emerald'}
        />
        <Kpi titolo="Persone con un ruolo" valore={conti.persone} dimensione="lg" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['area', 'persona'] as Vista[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVista(v)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              vista === v ? 'bg-slate-700 text-white' : 'bg-white text-slate-700 border border-slate-200'
            }`}
          >
            {v === 'area' ? 'Per area' : 'Per persona'}
          </button>
        ))}
        {vista === 'area' && (
          <label className="ml-auto inline-flex items-center gap-2 text-sm text-gray-500">
            <input type="checkbox" checked={conSpenti} onChange={(e) => setConSpenti(e.target.checked)} />
            Mostra i centri spenti
          </label>
        )}
      </div>

      {vista === 'area' && aree.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="text-gray-400">Legenda:</span>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-white">Area</span>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-800">Responsabile d&apos;area</span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">Servizio e coordinamento</span>
        </div>
      )}

      {vista === 'area' &&
        (aree.length === 0 ? (
          <Vuoto>Nessun centro di costo da mostrare.</Vuoto>
        ) : (
          aree.map((g) => (
            <section key={g.area} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2 bg-slate-800 px-4 py-3">
                <h3 className="text-lg font-bold text-white">{g.area}</h3>
                <span className="text-xs text-slate-300">
                  {g.centri.length} {g.centri.length === 1 ? 'servizio' : 'servizi'}
                </span>
              </div>
              <div className="border-b border-indigo-100 border-l-4 border-l-indigo-500 bg-indigo-50 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
                  Responsabile d&apos;area
                </p>
                <Persone
                  email={g.responsabili}
                  rubrica={rubrica}
                  nome={nome}
                  occupato={bloccato || occupato !== null}
                  vuoto="Nessun responsabile"
                  onCambia={(email) =>
                    salva(`area:${g.area}`, { tipo: 'area', area: g.area, email }, `Responsabile d'area di ${g.area} aggiornato.`)
                  }
                />
                {g.disallineata && (
                  <p className="mt-2 text-xs text-amber-700">
                    I servizi di quest&apos;area hanno responsabili diversi: qui li vedi tutti insieme, e
                    salvando diventano uguali per tutta l&apos;area.
                  </p>
                )}
              </div>
              <ul className="space-y-3 p-3">
                {g.centri.map((c) => (
                  <li key={c.codice} className="overflow-hidden rounded-xl border border-emerald-200">
                    <div className="flex flex-wrap items-center gap-2 bg-emerald-100 px-4 py-2">
                      <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white">
                        {c.codice}
                      </span>
                      <span className="font-semibold text-emerald-950">{c.nome}</span>
                      {!c.attivo && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                          spento
                        </span>
                      )}
                    </div>
                    <div className="bg-emerald-50/60 px-4 py-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Coordinamento</p>
                    <Persone
                      email={c.coordinatori}
                      rubrica={rubrica}
                      nome={nome}
                      occupato={bloccato || occupato !== null}
                      vuoto="Nessun coordinatore"
                      onCambia={(email) =>
                        salva(`cc:${c.codice}`, { tipo: 'coordinatori', codice: c.codice, email }, `Coordinamento di ${c.nome} aggiornato.`)
                      }
                    />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        ))}

      {vista === 'persona' &&
        (persone.length === 0 ? (
          <Vuoto>Nessuno ha ancora un ruolo.</Vuoto>
        ) : (
          <ul className="space-y-3">
            {persone.map((p) => (
              <li key={p.email} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="font-semibold text-gray-800">{nome(p.email)}</p>
                <p className="mb-3 truncate text-xs text-gray-400">{p.email}</p>
                {p.aree.length > 0 && (
                  <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                    <span className="font-semibold text-indigo-700">Responsabile d&apos;area:</span> {p.aree.join(', ')}
                  </p>
                )}
                {p.centri.length > 0 && (
                  <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-gray-700">
                    <span className="font-semibold text-emerald-700">Coordina:</span>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {p.centri.map((c) => (
                        <li key={c.codice} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs text-emerald-900">
                          {c.codice} · {c.nome}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
