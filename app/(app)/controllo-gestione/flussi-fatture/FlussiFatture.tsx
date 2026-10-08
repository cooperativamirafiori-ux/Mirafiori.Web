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
import { StatoDati, ImportaSdi } from './Testata'
import { NuovaUscita } from './NuovaUscita'
import { IbanRiga } from './IbanRiga'
import { ServizioRiga, type Centro } from './ServizioRiga'
import type { EsitoVerifica, RicevutaImport, RigaScadenza, TotaliCoda } from '@/types/pagamenti'

type Coda = 'da_verificare' | 'da_pagare' | 'da_approvare' | 'automatiche'

interface Dati {
  daVerificare: RigaScadenza[]
  daPagare: RigaScadenza[]
  daApprovare: RigaScadenza[]
  automatiche: RigaScadenza[]
  totali: TotaliCoda
  anzianita: Array<{ fascia: string; righe: number; importo: number }>
  ultimoImport: RicevutaImport | null
  centri: Centro[]
}

const euro = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

const euroEsatto = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

const dataIt = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT') : '—'

const oggiISO = () => new Date().toISOString().slice(0, 10)

const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * La riga risponde alla ricerca? Ogni parola scritta deve trovarsi da qualche
 * parte: fornitore, P.IVA, numero, oggetto, note, protocollo — oppure
 * nell'importo, scritto come viene (825 · 1.732,40 · 1732,4).
 */
function corrisponde(r: RigaScadenza, testo: string): boolean {
  const parole = norm(testo).split(/\s+/).filter(Boolean)
  if (!parole.length) return true
  const campi = norm(
    [r.titolo, r.fornitore, r.piva, r.numeroFornitore, r.oggetto, r.note, r.protocollo]
      .filter(Boolean)
      .join(' '),
  )
  const importo = Math.abs(r.importo).toFixed(2)
  return parole.every((p) => {
    if (campi.includes(p)) return true
    if (/^\d[\d.,]*$/.test(p)) {
      const n = p.includes(',') ? p.replace(/\./g, '').replace(',', '.') : p
      return importo.includes(n)
    }
    return false
  })
}

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
  // L'ultima risposta a delle righe "da verificare", per poterla annullare.
  const [ultimaVerifica, setUltimaVerifica] = useState<{ ids: string[]; pive: string[]; esito: EsitoVerifica } | null>(null)
  // Alla prima lettura, se c'è qualcosa da verificare si apre lì: è la coda
  // che blocca le altre, e nessun altro la guarderà.
  const primaLettura = useRef(true)
  // Spenta di default: le piastrelle raccontano le code, che è quello che si
  // vede sotto. Accesa, diventano una previsione di cassa — due domande
  // diverse, e chi guarda deve sapere quale sta leggendo.
  const [conAutomatici, setConAutomatici] = useState(false)
  // Ricerca: filtra le code che sono già qui e, a parte, cerca fra le chiuse.
  const [cerca, setCerca] = useState('')
  const [archivio, setArchivio] = useState<RigaScadenza[] | null>(null)
  const [cercandoArchivio, setCercandoArchivio] = useState(false)

  const finestra = (t: TotaliCoda, chiave: 'entro7' | 'entro30' | 'entro60' | 'entro90') =>
    t[chiave].importo + (conAutomatici ? t.automatiche[chiave].importo : 0)

  const carica = useCallback(async () => {
    setCaricando(true)
    try {
      const res = await fetch('/api/pagamenti/scadenze')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Errore di lettura')
      setDati(j)
      setErrore('')
      if (primaLettura.current) {
        primaLettura.current = false
        if (puoPagare && j.daVerificare?.length > 0) setCoda('da_verificare')
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di lettura')
    } finally {
      setCaricando(false)
    }
  }, [puoPagare])

  useEffect(() => {
    void carica()
  }, [carica])

  const filtrate = useMemo(() => {
    const f = (l: RigaScadenza[]) => (cerca.trim() ? l.filter((r) => corrisponde(r, cerca)) : l)
    return {
      da_verificare: f(dati?.daVerificare ?? []),
      da_pagare: f(dati?.daPagare ?? []),
      da_approvare: f(dati?.daApprovare ?? []),
      automatiche: f(dati?.automatiche ?? []),
    } satisfies Record<Coda, RigaScadenza[]>
  }, [dati, cerca])

  const righe = filtrate[coda]
  const ricercaAttiva = cerca.trim().length > 0

  // Le fatture già chiuse non sono fra le code: si chiedono al server, con un
  // attimo di attesa per non partire a ogni lettera.
  useEffect(() => {
    const q = cerca.trim()
    if (q.length < 2) {
      setArchivio(null)
      return
    }
    let annullata = false
    setCercandoArchivio(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pagamenti/scadenze/cerca?q=${encodeURIComponent(q)}`)
        const j = await res.json()
        if (!annullata) setArchivio(res.ok ? (j.righe ?? []) : [])
      } catch {
        if (!annullata) setArchivio([])
      } finally {
        if (!annullata) setCercandoArchivio(false)
      }
    }, 350)
    return () => {
      annullata = true
      clearTimeout(t)
    }
  }, [cerca])

  // Cambiando coda le spunte non hanno più senso: si azzerano, altrimenti
  // si preme un tasto su righe che non si stanno guardando.
  useEffect(() => {
    setScelte(new Set())
  }, [coda, cerca])

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

  /**
   * Cancella una riga inserita a mano. Vale solo su quelle: le scadenze da
   * fattura le governa l'import, e l'API rifiuta il loro id.
   */
  async function eliminaUscita(id: string) {
    setInCorso(true)
    setErrore('')
    setMessaggio('')
    try {
      const res = await fetch(`/api/pagamenti/uscite/${id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Cancellazione non riuscita')
      setMessaggio('Uscita cancellata')
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Cancellazione non riuscita')
    } finally {
      setInCorso(false)
    }
  }

  async function verificaSelezione(esito: EsitoVerifica) {
    const ids = selezionate.map((r) => r.id)
    if (ids.length === 0) return
    setInCorso(true)
    setErrore('')
    setMessaggio('')
    try {
      const res = await fetch('/api/pagamenti/scadenze/verifica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, esito, data: dataPagamento }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Operazione non riuscita')
      const imparati: string[] = j.imparati ?? []
      setMessaggio(
        `${j.aggiornate} ${j.aggiornate === 1 ? 'riga' : 'righe'} ` +
          (esito === 'da_pagare' ? 'messe in coda' : 'segnate come pagate') +
          (imparati.length > 0
            ? ` · ${imparati.length === 1 ? 'questo fornitore' : `${imparati.length} fornitori`} da ora si paga al momento: le prossime fatture senza modalità nasceranno pagate`
            : ''),
      )
      setUltimaVerifica({ ids, pive: imparati, esito })
      setScelte(new Set())
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione non riuscita')
    } finally {
      setInCorso(false)
    }
  }

  async function annullaVerifica() {
    if (!ultimaVerifica) return
    await azione('/api/pagamenti/scadenze/verifica', 'DELETE', {
      ids: ultimaVerifica.ids,
      pive: ultimaVerifica.pive,
    })
    setUltimaVerifica(null)
  }

  /**
   * Crea su Qonto le richieste di bonifico. Il denaro non si muove finché
   * qualcuno non le approva nell'app Qonto: qui si dice chiaramente.
   */
  async function inviaQonto() {
    const ids = selezionate.map((r) => r.id)
    if (ids.length === 0) return
    setInCorso(true)
    setErrore('')
    setMessaggio('')
    try {
      const res = await fetch('/api/pagamenti/scadenze/qonto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Invio non riuscito')
      const richieste: Array<{ conto: string; bonifici: number; totale: number }> = j.richieste ?? []
      const ignorate: Array<{ motivo: string }> = j.ignorate ?? []
      const parti = richieste.map((r) => `${r.conto}: ${r.bonifici} (${euroEsatto(r.totale)})`)
      setMessaggio(
        (j.inviate > 0
          ? `Inviate a Qonto ${j.inviate} ${j.inviate === 1 ? 'fattura' : 'fatture'} — ${parti.join(' · ')}. Ora vanno approvate nell’app Qonto.`
          : 'Nessuna fattura inviata.') +
          (ignorate.length > 0
            ? ` ${ignorate.length} non ${ignorate.length === 1 ? 'partita' : 'partite'}: ${[...new Set(ignorate.map((x) => x.motivo))].slice(0, 3).join('; ')}`
            : ''),
      )
      setScelte(new Set())
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Invio non riuscito')
    } finally {
      setInCorso(false)
    }
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

      {puoPagare && <ImportaSdi onFatto={carica} setErrore={setErrore} />}

      {/* Le uscite che non passano dallo SDI. Sta qui, sotto l'import delle
          fatture, perché è l'altra metà della stessa operazione: gli XML
          portano le fatture, questa mette il resto. */}
      {puoPagare && <NuovaUscita onFatto={carica} />}

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

      {ultimaVerifica && (
        <div className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <span className="text-sm text-gray-600">
            Hai appena risposto su {ultimaVerifica.ids.length}{' '}
            {ultimaVerifica.ids.length === 1 ? 'riga da verificare' : 'righe da verificare'}. Sbagliato?
          </span>
          <button
            onClick={annullaVerifica}
            disabled={inCorso}
            className="text-sm font-semibold text-slate-700 underline underline-offset-2 disabled:opacity-50"
          >
            Annulla
          </button>
        </div>
      )}

      {/* I numeri di testa: prima il ritardo, poi la scala del futuro.
          Le finestre sono cumulative e lasciano fuori lo scaduto — sommarlo al
          futuro nasconderebbe proprio quello che va guardato per primo. */}
      {t && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi titolo="Scaduto" valore={euro(t.scaduto.importo)} accento="red" />
            <Kpi titolo="Scade entro 7 giorni" valore={euro(finestra(t, 'entro7'))} accento="amber" />
            <Kpi titolo="Entro 30 giorni" valore={euro(finestra(t, 'entro30'))} accento="cyan" />
            <Kpi titolo="Entro 60 giorni" valore={euro(finestra(t, 'entro60'))} accento="cyan" />
            <Kpi titolo="Entro 90 giorni" valore={euro(finestra(t, 'entro90'))} accento="cyan" />
            <Kpi titolo="Da approvare" valore={euro(t.daApprovare.importo)} accento="violet" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={conAutomatici}
              onChange={(e) => setConAutomatici(e.target.checked)}
            />
            Includi gli addebiti automatici nelle finestre
            <span className="text-gray-400">
              (+{euro(t.automatiche.entro90.importo)} entro 90 giorni)
            </span>
          </label>
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

      {/* La ricerca sta sopra le code e vale per tutte: chi cerca una
          fattura non sa in quale coda è finita. */}
      <div className="relative">
        <input
          type="search"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca fornitore, numero fattura, P.IVA o importo"
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 pr-10 text-sm focus:border-slate-500 focus:outline-none"
        />
        {ricercaAttiva && (
          <button
            onClick={() => setCerca('')}
            aria-label="Cancella la ricerca"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-2 text-lg leading-none text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {dati && dati.daVerificare.length > 0 && (
          <Tab attivo={coda === 'da_verificare'} onClick={() => setCoda('da_verificare')} avviso>
            Da verificare ({filtrate.da_verificare.length})
          </Tab>
        )}
        <Tab attivo={coda === 'da_pagare'} onClick={() => setCoda('da_pagare')}>
          Da pagare {dati ? `(${filtrate.da_pagare.length})` : ''}
        </Tab>
        <Tab attivo={coda === 'da_approvare'} onClick={() => setCoda('da_approvare')}>
          Da approvare {dati ? `(${filtrate.da_approvare.length})` : ''}
        </Tab>
        <Tab attivo={coda === 'automatiche'} onClick={() => setCoda('automatiche')}>
          Escono da sole {dati ? `(${filtrate.automatiche.length})` : ''}
        </Tab>
      </div>

      {coda === 'da_verificare' && (
        <p className="text-sm text-gray-500">
          Fatture di cui l’app non sa se vanno ancora pagate: o la fattura non dice come si paga
          (scontrini fatti fattura, parcelle), o è un bonifico già scaduto quando l’app ha
          cominciato a leggere gli XML. Finché nessuno risponde, non entrano nelle code e non
          contano nei totali.
        </p>
      )}

      {coda === 'automatiche' && (
        <p className="text-sm text-gray-500">
          RID, SDD e domiciliazioni: nessuno le paga, se ne vanno da sole alla scadenza.
          Stanno qui perché il denaro esce comunque e chi guarda la cassa deve saperlo.
        </p>
      )}

      {caricando && <p className="text-sm text-gray-500">Caricamento…</p>}

      {!caricando && righe.length === 0 && !ricercaAttiva && (
        <Vuoto>{coda === 'da_approvare' ? 'Niente da approvare.' : 'Niente in coda.'}</Vuoto>
      )}

      {!caricando && righe.length === 0 && ricercaAttiva && (
        <AltroveRicerca filtrate={filtrate} onScegli={setCoda} />
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
                  (coda === 'da_verificare' && puoPagare) ||
                  (coda === 'da_pagare' && puoPagare) ||
                  (coda === 'da_approvare' && puoApprovare)
                }
                puoPagare={puoPagare}
                onAggiornato={carica}
                centri={dati?.centri ?? []}
                onToggle={() =>
                  setScelte((s) => {
                    const n = new Set(s)
                    if (n.has(r.id)) n.delete(r.id)
                    else n.add(r.id)
                    return n
                  })
                }
                onElimina={
                  r.origine === 'manuale' && puoPagare && r.stato !== 'pagata'
                    ? () => void eliminaUscita(r.id)
                    : undefined
                }
              />
            ))}
          </ul>
        </>
      )}

      {ricercaAttiva && cerca.trim().length >= 2 && (
        <section className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold text-gray-700">
            Già pagate o chiuse
            {archivio ? ` (${archivio.length}${archivio.length === 50 ? '+' : ''})` : ''}
          </h3>
          {cercandoArchivio && !archivio && <p className="text-sm text-gray-500">Cerco…</p>}
          {archivio && archivio.length === 0 && (
            <p className="text-sm text-gray-500">Nessuna fattura chiusa con questa ricerca.</p>
          )}
          {archivio && archivio.length > 0 && (
            <ul className="space-y-2">
              {archivio.map((r) => (
                <Riga
                  key={r.id}
                  r={r}
                  scelta={false}
                  selezionabile={false}
                  puoPagare={false}
                  onAggiornato={carica}
                  centri={dati?.centri ?? []}
                  onToggle={() => undefined}
                />
              ))}
            </ul>
          )}
        </section>
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
            className="rounded-xl border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50"
            title="Pagate fuori dall'app: registra solo il pagamento"
          >
            Segna come pagate ({scelte.size})
          </button>
          <button
            onClick={() => void inviaQonto()}
            disabled={inCorso}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            title="Crea le richieste di bonifico su Qonto, dal sottoconto del servizio. Partono solo dopo l'approvazione su Qonto."
          >
            Invia a Qonto ({scelte.size})
          </button>
        </BarraAzioni>
      )}

      {scelte.size > 0 && coda === 'da_verificare' && puoPagare && (
        <BarraAzioni>
          <span className="text-sm text-gray-600 w-full sm:w-auto">
            {scelte.size} · {euroEsatto(totaleSelezione)}
          </span>
          <button
            onClick={() => void verificaSelezione('negozio')}
            disabled={inCorso}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            title="Pagata al momento, il giorno della fattura. L'app impara il fornitore."
          >
            Pagata in negozio
          </button>
          <span className="flex items-center gap-2">
            <button
              onClick={() => void verificaSelezione('gia_pagata')}
              disabled={inCorso}
              className="rounded-xl border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50"
            >
              Già pagata il
            </button>
            <input
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
            />
          </span>
          <button
            onClick={() => void verificaSelezione('da_pagare')}
            disabled={inCorso}
            className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            title="Va pagata: entra in coda (da approvare se sopra soglia)"
          >
            Da pagare
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
  onElimina,
  puoPagare,
  onAggiornato,
  centri,
}: {
  r: RigaScadenza
  scelta: boolean
  selezionabile: boolean
  onToggle: () => void
  puoPagare: boolean
  onAggiornato: () => Promise<void>
  centri: Centro[]
  /** Solo sulle righe inserite a mano e non ancora pagate. */
  onElimina?: () => void
}) {
  const scaduta = r.giorniRitardo > 0
  // Due passaggi invece di window.confirm: la conferma sta dove si è cliccato,
  // e chi ha premuto per sbaglio se ne accorge senza che salti su una finestra.
  const [confermaElimina, setConfermaElimina] = useState(false)
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
          <span className="font-semibold text-gray-800 truncate">{r.titolo}</span>
          {/* Una riga inserita a mano si distingue: nessuno l'ha vista in un
              documento, e chi guarda la coda deve sapere che l'ha scritta una
              persona. La natura si mostra solo quando è un semplice movimento,
              perché è il caso che sorprende: esce dal conto ma non è un costo. */}
          {r.origine === 'manuale' && <Pill text="inserita a mano" tono="viola" />}
          {r.natura === 'flusso' && <Pill text="movimento di cassa" tono="ambra" />}
          {r.tipoDocumento === 'nota_credito' && <Pill text="nota di credito" tono="viola" />}
          {scaduta && (
            <Pill text={`scaduta da ${r.giorniRitardo} gg`} tono="rosso" dot="bg-red-500" />
          )}
          {r.stimata && <Pill text="scadenza stimata" tono="ambra" />}
          {r.stato === 'da_verificare' && r.motivoVerifica === 'senza_modalita' && (
            <Pill text="la fattura non dice come si paga" tono="ambra" />
          )}
          {r.stato === 'da_verificare' && r.motivoVerifica === 'primo_import' && (
            <Pill text="forse già pagata" tono="ambra" />
          )}
          {(r.qontoStato === 'pending' || r.qontoStato === 'invio') && (
            <Pill text="su Qonto · da approvare" tono="azzurro" dot="bg-cyan-500" />
          )}
          {r.qontoStato === 'declined' && <Pill text="rifiutata su Qonto" tono="rosso" />}
          {r.qontoStato === 'canceled' && <Pill text="annullata su Qonto" tono="ambra" />}
          {r.blocco === 'iban_mancante' && <Pill text="manca l’IBAN" tono="rosso" dot="bg-red-500" />}
          {r.blocco === 'iban_cambiato' && <Pill text="IBAN cambiato" tono="rosso" dot="bg-red-500" />}
          {r.approvataDa && r.stato === 'da_pagare' && <Pill text="approvata" tono="verde" />}
          {r.scomparsa && <Pill text="sparita dall’export" tono="ambra" />}
          {r.alert === 'possibile_doppio_pagamento' && (
            <Pill text="verifica: forse già pagata in negozio" tono="ambra" />
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          {r.origine === 'manuale'
            ? r.inseritaDa
              ? `Inserita da ${r.inseritaDa}`
              : 'Uscita senza fattura'
            : r.numeroFornitore
              ? `Fattura ${r.numeroFornitore}`
              : `Protocollo ${r.protocollo}`}
          {r.dataFornitore ? ` del ${dataIt(r.dataFornitore)}` : ''} · scade il{' '}
          <span className={r.stimata ? 'italic' : ''}>{dataIt(r.dataScadenza)}</span>
          {r.origine !== 'manuale' && r.modalita ? ` · ${r.modalita}` : ''}
        </p>
        {r.note && <p className="text-xs text-gray-500 mt-0.5">{r.note}</p>}
        {r.stato === 'da_approvare' && (
          <p className="text-xs text-gray-400 mt-0.5">in attesa da {r.giorniAttesa} giorni</p>
        )}
        {r.segnalazione && <p className="text-xs text-amber-700 mt-0.5">{r.segnalazione}</p>}
        {r.fatturaId && (
          <ServizioRiga
            fatturaId={r.fatturaId}
            cc={r.cc}
            centri={centri}
            modificabile={puoPagare}
            onFatto={onAggiornato}
          />
        )}
        {r.famiglia === 'bonifico' && r.stato !== 'pagata' && (
          <IbanRiga r={r} puoConfermare={puoPagare} onFatto={onAggiornato} />
        )}
        {(r.pdfUrl || r.fileSdiUrl) && (
          <p className="text-xs mt-1 flex gap-3">
            {r.pdfUrl && (
              <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="text-slate-600 underline underline-offset-2">
                PDF
              </a>
            )}
            {r.fileSdiUrl && (
              <a href={r.fileSdiUrl} target="_blank" rel="noreferrer" className="text-gray-400 underline underline-offset-2">
                XML
              </a>
            )}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="font-bold text-gray-800">{euroEsatto(r.importo)}</p>
        {r.dataPagamento && (
          <p className="text-xs text-gray-400">
            pagata il {dataIt(r.dataPagamento)}
            {r.originePagamento === 'gestionale' && ' · secondo il gestionale'}
          </p>
        )}
        {onElimina && (
          <p className="text-xs mt-0.5">
            {confermaElimina ? (
              <>
                <button
                  onClick={onElimina}
                  className="font-semibold text-red-600 underline underline-offset-2"
                >
                  Cancella
                </button>
                <span className="text-gray-300 mx-1">·</span>
                <button
                  onClick={() => setConfermaElimina(false)}
                  className="text-gray-500 underline underline-offset-2"
                >
                  no
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfermaElimina(true)}
                className="text-gray-400 underline underline-offset-2 hover:text-gray-600"
              >
                elimina
              </button>
            )}
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
  avviso,
}: {
  attivo: boolean
  onClick: () => void
  children: React.ReactNode
  /** Coda che aspetta una risposta: si vede anche quando non è aperta. */
  avviso?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold border transition-colors ${
        attivo
          ? avviso
            ? 'bg-amber-600 text-white border-amber-600'
            : 'bg-slate-700 text-white border-slate-700'
          : avviso
            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:border-amber-400'
            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

/** Niente in questa coda: dice in quali altre code la ricerca ha trovato qualcosa. */
function AltroveRicerca({
  filtrate,
  onScegli,
}: {
  filtrate: Record<Coda, RigaScadenza[]>
  onScegli: (c: Coda) => void
}) {
  const nomi: Record<Coda, string> = {
    da_verificare: 'Da verificare',
    da_pagare: 'Da pagare',
    da_approvare: 'Da approvare',
    automatiche: 'Escono da sole',
  }
  const altrove = (Object.keys(nomi) as Coda[]).filter((c) => filtrate[c].length > 0)
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
      {altrove.length === 0 ? (
        'Nessuna fattura in coda con questa ricerca.'
      ) : (
        <>
          Non è in questa coda. Trovata in:{' '}
          {altrove.map((c, i) => (
            <span key={c}>
              {i > 0 && ' · '}
              <button
                onClick={() => onScegli(c)}
                className="font-semibold text-slate-700 underline underline-offset-2"
              >
                {nomi[c]} ({filtrate[c].length})
              </button>
            </span>
          ))}
        </>
      )}
    </div>
  )
}

function BarraAzioni({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-3 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
      {children}
    </div>
  )
}
