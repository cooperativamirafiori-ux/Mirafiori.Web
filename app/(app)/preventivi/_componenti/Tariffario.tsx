'use client'

/**
 * Il tariffario: la matrice di Andrea (20/11/2026), per servizio. Ogni riga è
 * Servizio + Sottotipo + Voce + Ente pagante → prezzo; il prezzo vuoto è "da
 * definire" e lo scrive chi fa il preventivo.
 *
 * Chi ha il permesso Preventivi o "Amministrazione" può:
 *   - Nuovo prezzo: da una data in poi (la riga vecchia si chiude il giorno prima);
 *   - Modifica: nome, servizio, sottotipo, ente, sezione, note — senza toccare i prezzi;
 *   - Chiudi: la voce non vale più dopo una data;
 *   - Nuova voce;
 *   - Adeguamento ISTAT: percentuale + decorrenza, anteprima voce per voce, poi applica.
 * Il passato non cambia mai: i preventivi già fatti hanno i loro prezzi.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { inputCls, labelCls } from '@/components/ui/Campo'
import { Pill } from '@/components/ui/Pill'
import { Vuoto } from '@/components/ui/Vuoto'
import { ENTE_TUTTI, REGIMI_IVA, UNITA, type Ente, type Tariffa } from '@/types/preventivi'
import { dataIt, oggiIso, tariffaValidaIl } from '@/lib/preventivi/calcoli'
import { PannelloChiudi, PannelloIstat, PannelloModifica, PannelloNuova, PannelloPrezzo, chiama, prezzoTesto } from './TariffarioPannelli'

type Pannello =
  | { tipo: 'prezzo'; t: Tariffa }
  | { tipo: 'modifica'; t: Tariffa }
  | { tipo: 'chiudi'; t: Tariffa }
  | { tipo: 'nuova' }
  | { tipo: 'istat' }

export function Tariffario({ modificabile }: { modificabile: boolean }) {
  const [tariffe, setTariffe] = useState<Tariffa[] | null>(null)
  const [enti, setEnti] = useState<Ente[]>([])
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [storico, setStorico] = useState(false)
  const [filtroServizio, setFiltroServizio] = useState('')
  const [cerca, setCerca] = useState('')
  const [pannello, setPannello] = useState<Pannello | null>(null)
  const oggi = oggiIso()

  const carica = useCallback(async () => {
    try {
      const [t, e] = await Promise.all([
        chiama<{ tariffe: Tariffa[] }>('/api/preventivi/tariffario', 'GET'),
        chiama<{ enti: Ente[] }>('/api/preventivi/enti', 'GET').catch(() => ({ enti: [] as Ente[] })),
      ])
      setTariffe(t.tariffe)
      setEnti(e.enti)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di lettura')
    }
  }, [])
  useEffect(() => {
    void carica()
  }, [carica])

  const fatto = async (m: string) => {
    setPannello(null)
    setMessaggio(m)
    await carica()
  }

  const servizi = useMemo(() => {
    const visti = new Map<string, number>()
    for (const t of tariffe ?? []) if (!visti.has(t.servizio)) visti.set(t.servizio, t.ordine)
    return [...visti.entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s)
  }, [tariffe])

  const perServizio = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    const visibili = (tariffe ?? [])
      .filter((t) => storico || tariffaValidaIl(t, oggi) || t.dal > oggi)
      .filter((t) => !filtroServizio || t.servizio === filtroServizio)
      .filter((t) => !q || [t.servizio, t.sottotipo, t.voce, t.ente].some((x) => x.toLowerCase().includes(q)))
      .sort((a, b) => a.ordine - b.ordine || a.codice.localeCompare(b.codice) || b.dal.localeCompare(a.dal))
    const m = new Map<string, Tariffa[]>()
    for (const t of visibili) m.set(t.servizio, [...(m.get(t.servizio) ?? []), t])
    return [...m.entries()]
  }, [tariffe, storico, oggi, filtroServizio, cerca])

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        I prezzi con cui si fanno i preventivi, dalla tabella di Andrea. Il prezzo dipende dal servizio e dall’ente; quelli{' '}
        <b>da definire</b> li scrive chi fa il preventivo.
      </p>
      {modificabile && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPannello({ tipo: 'istat' })} className="grow sm:grow-0 px-4 py-2.5 rounded-xl bg-primary text-white font-semibold">
            Adeguamento ISTAT
          </button>
          <button
            onClick={() => setPannello({ tipo: 'nuova' })}
            className="grow sm:grow-0 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 font-semibold"
          >
            + Nuova voce
          </button>
        </div>
      )}
      <Banner tono="ok">{messaggio}</Banner>
      <Banner tono="errore">{errore}</Banner>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={labelCls}>Servizio</span>
          <select className={`${inputCls} bg-white`} value={filtroServizio} onChange={(e) => setFiltroServizio(e.target.value)}>
            <option value="">Tutti i servizi</option>
            {servizi.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Cerca</span>
          <input className={inputCls} value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="voce, ente, sottotipo…" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={storico} onChange={(e) => setStorico(e.target.checked)} />
        Mostra anche i prezzi non più in vigore
      </label>

      {tariffe && !perServizio.length && (
        <Vuoto>{tariffe.length ? 'Nessuna voce con questi filtri.' : 'Il tariffario è vuoto: lancia scripts/preventivi-carica-matrice.mjs.'}</Vuoto>
      )}
      {!tariffe && !errore && <p className="text-sm text-gray-500">Carico…</p>}

      {perServizio.map(([servizio, voci]) => (
        <section key={servizio} className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">{servizio}</h3>
          <ul className="space-y-2">
            {voci.map((t) => {
              const inVigore = tariffaValidaIl(t, oggi)
              const futura = t.dal > oggi
              return (
                <li key={t.spItemId} className={`bg-white rounded-xl border border-gray-100 p-3 ${!inVigore && !futura ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-800">{t.voce}</span>
                    {t.sottotipo && <Pill text={t.sottotipo} tono="azzurro" />}
                    {t.ente !== ENTE_TUTTI && <Pill text={t.ente} tono="viola" />}
                    {futura && <Pill text={`dal ${dataIt(t.dal)}`} tono="azzurro" />}
                    {!inVigore && !futura && <Pill text="non più in vigore" tono="neutro" />}
                  </div>
                  <p className={`text-sm mt-1 ${t.prezzo === null ? 'text-amber-700' : 'text-gray-700'}`}>
                    {prezzoTesto(t)} per {UNITA[t.unita].etichetta} · {REGIMI_IVA[t.iva].etichetta} · {t.gruppo}
                  </p>
                  <p className="text-xs text-gray-500">
                    valido dal {dataIt(t.dal)}
                    {t.al ? ` al ${dataIt(t.al)}` : ''}
                  </p>
                  {t.note && <p className="text-xs text-gray-500 mt-1">{t.note}</p>}
                  {modificabile && (inVigore || futura) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {!t.al && (
                        <button onClick={() => setPannello({ tipo: 'prezzo', t })} className="px-3 py-1.5 rounded-lg border border-brand-cyan-dark text-brand-cyan-dark text-sm font-semibold">
                          Nuovo prezzo
                        </button>
                      )}
                      <button onClick={() => setPannello({ tipo: 'modifica', t })} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold">
                        Modifica
                      </button>
                      {!t.al && (
                        <button onClick={() => setPannello({ tipo: 'chiudi', t })} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-sm font-semibold">
                          Chiudi
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {pannello?.tipo === 'prezzo' && <PannelloPrezzo t={pannello.t} onChiudi={() => setPannello(null)} onFatto={fatto} />}
      {pannello?.tipo === 'modifica' && (
        <PannelloModifica t={pannello.t} enti={enti} servizi={servizi} onChiudi={() => setPannello(null)} onFatto={fatto} />
      )}
      {pannello?.tipo === 'chiudi' && <PannelloChiudi t={pannello.t} onChiudi={() => setPannello(null)} onFatto={fatto} />}
      {pannello?.tipo === 'nuova' && <PannelloNuova enti={enti} servizi={servizi} onChiudi={() => setPannello(null)} onFatto={fatto} />}
      {pannello?.tipo === 'istat' && <PannelloIstat onChiudi={() => setPannello(null)} onFatto={fatto} />}
    </div>
  )
}
