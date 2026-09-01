'use client'

/**
 * Il cruscotto dei Flussi fatture: due code, un caricamento, due tasti.
 *
 * Le scelte di interfaccia che vale la pena non disfare:
 *
 *  - **Le scadute stanno in cima**, sempre. La coda ordina per data di
 *    scadenza crescente, quindi il ritardo si vede per primo.
 *  - **Selezione multipla** su entrambe le code. Sette fatture allo stesso
 *    fornitore si saldano con un bonifico solo: dovendo cliccare sette volte,
 *    la settima si sbaglia riga.
 *  - **La data di pagamento è modificabile.** Si può registrare il martedì un
 *    bonifico partito il venerdì; se la data è finta, la previsione di cassa
 *    che verrà dopo è finta con lei.
 *  - **Il clic si annulla.** Chi sbaglia riga deve poter tornare indietro da
 *    solo, senza chiedere aiuto a nessuno.
 *  - **In cima si dice da quanti giorni i dati non si aggiornano.** Un
 *    cruscotto vecchio di tre settimane che non lo dice è peggio di uno vuoto.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Kpi } from '@/components/ui/Kpi'
import { Pill } from '@/components/ui/Pill'
import { Banner } from '@/components/ui/Banner'
import { Vuoto } from '@/components/ui/Vuoto'
import { StatoDati, Caricamento } from './Testata'
import type { RicevutaImport, RigaScadenza, TotaliCoda } from '@/types/pagamenti'

type Coda = 'da_pagare' | 'da_approvare' | 'automatiche'

interface Dati {
  daPagare: RigaScadenza[]
  daApprovare: RigaScadenza[]
  automatiche: RigaScadenza[]
  totali: TotaliCoda
  anzianita: Array<{ fascia: string; righe: number; importo: number }>
  ultimoImport: RicevutaImport | null
}

const euro = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

const euroEsatto = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

const dataIt = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT') : '—'

const oggiISO = () => new Date().toISOString().slice(0, 10)

export function FlussiFatture({
  puoPagare,
  puoApprovare,
}: {
  puoPagare: boolean
  puoApprovare: boolean
}) {
  const [dati, setDati] = useState<Dati | null>(null)
  const [caricando, setCaricando] = useState(true)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [coda, setCoda] = useState<Coda>(puoApprovare && !puoPagare ? 'da_approvare' : 'da_pagare')
  const [scelte, setScelte] = useState<Set<string>>(new Set())
  const [dataPagamento, setDataPagamento] = useState(oggiISO())
  const [inCorso, setInCorso] = useState(false)
  const [ultimeChiuse, setUltimeChiuse] = useState<string[]>([])

  const carica = useCallback(async () => {
    setCaricando(true)
    try {
      const res = await fetch('/api/pagamenti/scadenze')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Errore di lettura')
      setDati(j)
      setErrore('')
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di lettura')
    } finally {
      setCaricando(false)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  const righe = useMemo(() => {
    if (!dati) return []
    if (coda === 'da_pagare') return dati.daPagare
    if (coda === 'da_approvare') return dati.daApprovare
    return dati.automatiche
  }, [dati, coda])

  // Cambiando coda le spunte non hanno più senso: si azzerano, altrimenti
  // si preme un tasto su righe che non si stanno guardando.
  useEffect(() => {
    setScelte(new Set())
  }, [coda])

  const selezionate = righe.filter((r) => scelte.has(r.id))
  const totaleSelezione = selezionate.reduce((s, r) => s + r.importo, 0)

  async function azione(url: string, metodo: 'POST' | 'DELETE', corpo: Record<string, unknown>) {
    setInCorso(true)
    setErrore('')
    setMessaggio('')
    try {
      const res = await fetch(url, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Operazione non riuscita')
      const ignorate: Array<{ motivo: string }> = j.ignorate ?? []
      setMessaggio(
        `${j.aggiornate} ${j.aggiornate === 1 ? 'riga aggiornata' : 'righe aggiornate'}` +
          (ignorate.length > 0 ? ` · ${ignorate.length} non toccate: ${ignorate[0].motivo}` : ''),
      )
      setScelte(new Set())
      await carica()
      return true
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione non riuscita')
      return false
    } finally {
      setInCorso(false)
    }
  }

  async function paga() {
    const ids = selezionate.map((r) => r.id)
    if (ids.length === 0) return
    const ok = await azione('/api/pagamenti/scadenze/pagata', 'POST', { ids, data: dataPagamento })
    if (ok) setUltimeChiuse(ids)
  }

  async function annulla() {
    if (ultimeChiuse.length === 0) return
    await azione('/api/pagamenti/scadenze/pagata', 'DELETE', { ids: ultimeChiuse })
    setUltimeChiuse([])
  }

  async function approvaSelezione() {
    const ids = selezionate.map((r) => r.id)
    if (ids.length === 0) return
    await azione('/api/pagamenti/scadenze/approva', 'POST', { ids })
  }

  const t = dati?.totali

  return (
    <div className="space-y-5">
      <StatoDati ultimo={dati?.ultimoImport ?? null} />

      {puoPagare && <Caricamento onFatto={carica} setErrore={setErrore} />}

      <Banner tono="errore">{errore}</Banner>
      <Banner tono="ok">{messaggio}</Banner>

      {ultimeChiuse.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <span className="text-sm text-gray-600">
            Hai appena chiuso {ultimeChiuse.length}{' '}
            {ultimeChiuse.length === 1 ? 'scadenza' : 'scadenze'}. Riga sbagliata?
          </span>
          <button
            onClick={annulla}
            disabled={inCorso}
            className="text-sm font-semibold text-slate-700 underline underline-offset-2 disabled:opacity-50"
          >
            Annulla
          </button>
        </div>
      )}

      {/* I numeri di testa. `impegnato` è quello che di solito manca: chi
          approva guardando solo «da approvare» impegna due volte lo stesso
          denaro. */}
      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi titolo="Scaduto" valore={euro(t.scaduto.importo)} accento="red" />
          <Kpi titolo="Scade entro 7 giorni" valore={euro(t.entro7.importo)} accento="amber" />
          <Kpi titolo="Da approvare" valore={euro(t.daApprovare.importo)} accento="violet" />
          <Kpi
            titolo="Approvato, non ancora pagato"
            valore={euro(t.impegnato.importo)}
            accento="slate"
          />
        </div>
      )}

      {dati && dati.anzianita.some((f) => f.righe > 0) && (
        <details className="bg-white border border-gray-100 rounded-xl px-4 py-3">
          <summary className="text-sm font-semibold text-gray-700 cursor-pointer">
            Lo scaduto per anzianità
          </summary>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            {dati.anzianita.map((f) => (
              <Kpi
                key={f.fascia}
                titolo={`${f.fascia} · ${f.righe} righe`}
                valore={euro(f.importo)}
                tenue
              />
            ))}
          </div>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        <Tab attivo={coda === 'da_pagare'} onClick={() => setCoda('da_pagare')}>
          Da pagare {dati ? `(${dati.daPagare.length})` : ''}
        </Tab>
        <Tab attivo={coda === 'da_approvare'} onClick={() => setCoda('da_approvare')}>
          Da approvare {dati ? `(${dati.daApprovare.length})` : ''}
        </Tab>
        <Tab attivo={coda === 'automatiche'} onClick={() => setCoda('automatiche')}>
          Escono da sole {dati ? `(${dati.automatiche.length})` : ''}
        </Tab>
      </div>

      {coda === 'automatiche' && (
        <p className="text-sm text-gray-500">
          RID, SDD e domiciliazioni: nessuno le paga, se ne vanno da sole alla scadenza.
          Stanno qui perché il denaro esce comunque e chi guarda la cassa deve saperlo.
        </p>
      )}

      {caricando && <p className="text-sm text-gray-500">Caricamento…</p>}

      {!caricando && righe.length === 0 && (
        <Vuoto>{coda === 'da_approvare' ? 'Niente da approvare.' : 'Niente in coda.'}</Vuoto>
      )}

      {righe.length > 0 && (
        <>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-gray-600">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={scelte.size === righe.length && righe.length > 0}
                onChange={(e) =>
                  setScelte(e.target.checked ? new Set(righe.map((r) => r.id)) : new Set())
                }
              />
              Seleziona tutto
            </label>
            {scelte.size > 0 && (
              <span className="text-gray-500">
                {scelte.size} selezionate · {euroEsatto(totaleSelezione)}
              </span>
            )}
          </div>

          <ul className="space-y-2">
            {righe.map((r) => (
              <Riga
                key={r.id}
                r={r}
                scelta={scelte.has(r.id)}
                selezionabile={
                  (coda === 'da_pagare' && puoPagare) || (coda === 'da_approvare' && puoApprovare)
                }
                onToggle={() =>
                  setScelte((s) => {
                    const n = new Set(s)
                    if (n.has(r.id)) n.delete(r.id)
                    else n.add(r.id)
                    return n
                  })
                }
              />
            ))}
          </ul>
        </>
      )}

      {/* Barra delle azioni: compare solo con qualcosa selezionato, e solo a
          chi può davvero premere quel tasto. */}
      {scelte.size > 0 && coda === 'da_pagare' && puoPagare && (
        <BarraAzioni>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Pagate il
            <input
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
          <button
            onClick={paga}
            disabled={inCorso}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Segna come pagate ({scelte.size})
          </button>
        </BarraAzioni>
      )}

      {scelte.size > 0 && coda === 'da_approvare' && puoApprovare && (
        <BarraAzioni>
          <span className="text-sm text-gray-600">{euroEsatto(totaleSelezione)}</span>
          <button
            onClick={approvaSelezione}
            disabled={inCorso}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Approva ({scelte.size})
          </button>
        </BarraAzioni>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Pezzi
// ------------------------------------------------------------
function Riga({
  r,
  scelta,
  selezionabile,
  onToggle,
}: {
  r: RigaScadenza
  scelta: boolean
  selezionabile: boolean
  onToggle: () => void
}) {
  const scaduta = r.giorniRitardo > 0
  return (
    <li
      className={`flex items-start gap-3 rounded-xl border bg-white px-3 py-3 ${
        scaduta ? 'border-red-200' : 'border-gray-200'
      }`}
    >
      {selezionabile && (
        <input type="checkbox" className="mt-1 h-4 w-4" checked={scelta} onChange={onToggle} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-gray-800 truncate">{r.fornitore}</span>
          {r.tipoDocumento === 'nota_credito' && <Pill text="nota di credito" tono="viola" />}
          {scaduta && (
            <Pill text={`scaduta da ${r.giorniRitardo} gg`} tono="rosso" dot="bg-red-500" />
          )}
          {r.stimata && <Pill text="scadenza stimata" tono="ambra" />}
          {r.approvataDa && r.stato === 'da_pagare' && <Pill text="approvata" tono="verde" />}
          {r.scomparsa && <Pill text="sparita dall’export" tono="ambra" />}
          {r.alert === 'possibile_doppio_pagamento' && (
            <Pill text="verifica: forse già pagata in negozio" tono="ambra" />
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          {r.numeroFornitore ? `Fattura ${r.numeroFornitore}` : `Protocollo ${r.protocollo}`}
          {r.dataFornitore ? ` del ${dataIt(r.dataFornitore)}` : ''} · scade il{' '}
          <span className={r.stimata ? 'italic' : ''}>{dataIt(r.dataScadenza)}</span>
          {r.modalita ? ` · ${r.modalita}` : ''}
        </p>
        {r.stato === 'da_approvare' && (
          <p className="text-xs text-gray-400 mt-0.5">in attesa da {r.giorniAttesa} giorni</p>
        )}
        {r.segnalazione && <p className="text-xs text-amber-700 mt-0.5">{r.segnalazione}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="font-bold text-gray-800">{euroEsatto(r.importo)}</p>
        {r.dataPagamento && (
          <p className="text-xs text-gray-400">
            pagata il {dataIt(r.dataPagamento)}
            {r.originePagamento === 'gestionale' && ' · secondo il gestionale'}
          </p>
        )}
      </div>
    </li>
  )
}

function Tab({
  attivo,
  onClick,
  children,
}: {
  attivo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors ${
        attivo
          ? 'bg-slate-700 text-white border-slate-700'
          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

function BarraAzioni({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-3 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
      {children}
    </div>
  )
}
