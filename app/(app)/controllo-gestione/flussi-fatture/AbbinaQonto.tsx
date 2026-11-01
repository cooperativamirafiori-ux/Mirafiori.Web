'use client'

/**
 * Da abbinare (Qonto): le uscite di Qonto senza fattura, e gli abbinamenti
 * degli ultimi 30 giorni da poter annullare.
 *
 * Regole (Dennis, 1/11/2026 — docs/riconciliazione-qonto.md): quello che è
 * sicuro l'app lo abbina da sola ogni notte; qui arriva solo il resto. Per
 * ogni uscita si propongono le fatture più probabili; se ne possono spuntare
 * più d'una (bonifico cumulativo). "Non serve fattura" per stipendi,
 * commissioni e simili, con la spunta per ricordarlo.
 *
 * Da telefono: tutto impilato, i tasti vanno a capo, niente tabelle.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pill } from '@/components/ui/Pill'
import { Banner } from '@/components/ui/Banner'
import { Vuoto } from '@/components/ui/Vuoto'

interface ScadenzaInBreve {
  id: string
  fornitore: string
  numero: string | null
  dataFattura: string | null
  importo: number
  stato: string
  cc: string | null
  ccIndicato: string | null
  stessoImporto?: boolean
  fornitoreRiconosciuto?: string | null
}

interface Movimento {
  id: string
  data: string
  importo: number
  conto: string | null
  cc: string | null
  tipo: string | null
  controparte: string | null
  riferimento: string | null
  carta: string | null
  inAttesa: boolean
  abbinamento: 'da_abbinare' | 'abbinato' | 'ignorato'
  modo: 'auto' | 'manuale' | null
  abbinatoDa: string | null
  abbinatoIl: string | null
  nota: string | null
  scadenze: ScadenzaInBreve[]
}

interface Dati {
  daAbbinare: Movimento[]
  recenti: Movimento[]
  ultimaLettura: string | null
}

const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const dataIt = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('it-IT') : '—')
const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'mai'

const STATI: Record<string, string> = {
  da_pagare: 'da pagare',
  da_approvare: 'da approvare',
  da_verificare: 'da verificare',
  pagata: 'già pagata',
}

function tipoLeggibile(m: Movimento): string {
  if (m.tipo === 'card') return m.carta ? `Carta ••${m.carta}` : 'Carta'
  if (m.tipo === 'transfer') return 'Bonifico'
  if (m.tipo === 'direct_debit') return 'Addebito diretto'
  if (m.tipo === 'qonto_fee') return 'Commissione Qonto'
  return m.tipo ?? 'Uscita'
}

export function AbbinaQonto({ onCambiato }: { onCambiato: () => Promise<void> | void }) {
  const [dati, setDati] = useState<Dati | null>(null)
  const [caricando, setCaricando] = useState(true)
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [cerca, setCerca] = useState('')

  const carica = useCallback(async () => {
    setCaricando(true)
    try {
      const res = await fetch('/api/pagamenti/qonto-movimenti')
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

  async function invia(corpo: Record<string, unknown>, ok: (esito: any) => string) {
    setInCorso(true)
    setErrore('')
    setMessaggio('')
    try {
      const res = await fetch('/api/pagamenti/qonto-movimenti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Operazione non riuscita')
      setMessaggio(ok(j.esito))
      await Promise.all([carica(), onCambiato()])
      return true
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione non riuscita')
      return false
    } finally {
      setInCorso(false)
    }
  }

  const controlla = () =>
    invia({ azione: 'controlla' }, (e) => {
      const a = e?.abbinamento
      const l = e?.lettura
      const err = l?.errori?.length ? ` · ${l.errori.length} conti non letti: ${l.errori[0]}` : ''
      return `Letti ${l?.letti ?? 0} movimenti da Qonto · ${a?.abbinati ?? 0} abbinati in automatico (${a?.scadenzeChiuse ?? 0} fatture chiuse) · ${a?.daAbbinare ?? 0} da abbinare a mano${err}`
    })

  const filtrati = useMemo(() => {
    const l = dati?.daAbbinare ?? []
    const q = cerca.trim().toLowerCase()
    if (!q) return l
    return l.filter((m) =>
      [m.controparte, m.conto, m.riferimento, m.importo.toFixed(2), m.importo.toFixed(2).replace('.', ','), ...m.scadenze.map((s) => s.fornitore)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [dati, cerca])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-2">
        <p className="text-sm text-gray-600">
          Le uscite di Qonto dal 1° novembre 2026 che l’app non ha saputo abbinare da sola a una
          fattura. Quelle sicure (stesso importo, stesso fornitore, una sola possibilità) si
          chiudono ogni notte senza passare di qui.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void controlla()}
            disabled={inCorso}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {inCorso ? 'Un momento…' : 'Controlla Qonto adesso'}
          </button>
          <span className="text-xs text-gray-500">Ultima lettura: {quando(dati?.ultimaLettura ?? null)}</span>
        </div>
      </div>

      <Banner tono="errore">{errore}</Banner>
      <Banner tono="ok">{messaggio}</Banner>

      {caricando && !dati && <p className="text-sm text-gray-500">Caricamento…</p>}

      {dati && (
        <>
          {dati.daAbbinare.length > 3 && (
            <input
              type="search"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca controparte, servizio o importo"
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-slate-500 focus:outline-none"
            />
          )}

          {dati.daAbbinare.length === 0 ? (
            <Vuoto>Niente da abbinare: ogni uscita di Qonto ha la sua fattura.</Vuoto>
          ) : (
            <ul className="space-y-3">
              {filtrati.map((m) => (
                <MovimentoDaAbbinare
                  key={m.id}
                  m={m}
                  inCorso={inCorso}
                  onAbbina={(ids) =>
                    invia({ azione: 'abbina', movimentoId: m.id, scadenzaIds: ids }, (e) =>
                      `Abbinato: ${e?.scadenze ?? ids.length} ${ids.length === 1 ? 'fattura chiusa' : 'fatture chiuse'}${e?.nota ? ` · ${e.nota}` : ''}`,
                    )
                  }
                  onIgnora={(nota, sempre) =>
                    invia({ azione: 'ignora', movimentoId: m.id, nota, sempre }, (e) =>
                      e?.sempre ? 'Segnato: non serve fattura, anche le prossime volte per questa controparte' : 'Segnato: non serve fattura',
                    )
                  }
                />
              ))}
            </ul>
          )}

          {dati.recenti.length > 0 && (
            <details className="rounded-xl border border-gray-100 bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-gray-700">
                Sistemati negli ultimi 30 giorni ({dati.recenti.length})
              </summary>
              <ul className="mt-3 space-y-2">
                {dati.recenti.map((m) => (
                  <Sistemato
                    key={m.id}
                    m={m}
                    inCorso={inCorso}
                    onAnnulla={() =>
                      invia({ azione: 'annulla', movimentoId: m.id }, (e) =>
                        `Annullato${e?.riaperte ? `: ${e.riaperte} ${e.riaperte === 1 ? 'fattura è tornata' : 'fatture sono tornate'} in coda` : ''}. Da qui in avanti questo movimento si abbina solo a mano.`,
                      )
                    }
                  />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}

function Testa({ m }: { m: Movimento }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-gray-800 break-words">{m.controparte ?? 'Controparte sconosciuta'}</span>
          {m.inAttesa && <Pill text="in attesa su Qonto" tono="azzurro" dot="bg-cyan-500" />}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          {dataIt(m.data)} · {tipoLeggibile(m)} · {m.cc ? m.cc : 'conto principale'}
          {m.conto && m.cc ? ` (${m.conto.replace(/^cc\d+\s*·\s*/i, '')})` : ''}
        </p>
        {m.riferimento && <p className="text-xs text-gray-500 mt-0.5 break-words">{m.riferimento}</p>}
      </div>
      <p className="font-bold text-gray-800 shrink-0">{euro(m.importo)}</p>
    </div>
  )
}

function MovimentoDaAbbinare({
  m,
  inCorso,
  onAbbina,
  onIgnora,
}: {
  m: Movimento
  inCorso: boolean
  onAbbina: (ids: string[]) => Promise<boolean>
  onIgnora: (nota: string, sempre: boolean) => Promise<boolean>
}) {
  const [scelte, setScelte] = useState<Set<string>>(new Set())
  const [ignorando, setIgnorando] = useState(false)
  const [nota, setNota] = useState('')
  const [sempre, setSempre] = useState(false)
  const somma = m.scadenze.filter((s) => scelte.has(s.id)).reduce((x, s) => x + s.importo, 0)
  const diff = Math.round((m.importo - somma) * 100) / 100

  return (
    <li className="rounded-xl border border-gray-200 bg-white px-3 py-3 space-y-3">
      <Testa m={m} />

      {m.scadenze.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nessuna fattura aperta gli somiglia. Forse la fattura deve ancora arrivare: si riprova ogni notte.
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Fatture possibili</p>
          {m.scadenze.map((s) => (
            <label key={s.id} className="flex items-start gap-3 rounded-lg border border-gray-100 px-2 py-2 cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={scelte.has(s.id)}
                onChange={() =>
                  setScelte((x) => {
                    const n = new Set(x)
                    if (n.has(s.id)) n.delete(s.id)
                    else n.add(s.id)
                    return n
                  })
                }
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-gray-800 break-words">{s.fornitore}</span>
                  <Pill text={STATI[s.stato] ?? s.stato} tono={s.stato === 'pagata' ? 'verde' : 'neutro'} />
                  {s.stessoImporto && <Pill text="stesso importo" tono="verde" />}
                  {s.fornitoreRiconosciuto && <Pill text="stesso fornitore" tono="verde" />}
                  {s.ccIndicato && (
                    <Pill text={`in fattura ${s.ccIndicato}`} tono={m.cc && s.ccIndicato !== m.cc ? 'rosso' : 'neutro'} />
                  )}
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {s.numero ? `Fattura ${s.numero}` : 'Fattura'} del {dataIt(s.dataFattura)}
                  {s.cc ? ` · ${s.cc}` : ''}
                </span>
              </span>
              <span className="text-sm font-semibold text-gray-700 shrink-0">{euro(s.importo)}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {scelte.size > 0 && (
          <>
            <button
              onClick={async () => {
                if (await onAbbina([...scelte])) setScelte(new Set())
              }}
              disabled={inCorso}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Abbina ({scelte.size})
            </button>
            {diff !== 0 && (
              <span className="text-xs text-amber-700">
                Attenzione: le fatture fanno {euro(somma)}, il movimento {euro(m.importo)}
              </span>
            )}
          </>
        )}
        {!ignorando && (
          <button
            onClick={() => setIgnorando(true)}
            disabled={inCorso}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-50"
          >
            Non serve fattura
          </button>
        )}
      </div>

      {ignorando && (
        <div className="space-y-2 rounded-lg bg-gray-50 px-3 py-3">
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Perché? (stipendio, commissione, rimborso…)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm"
          />
          <label className="flex items-start gap-2 text-sm text-gray-600">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={sempre} onChange={(e) => setSempre(e.target.checked)} />
            <span>
              Anche le prossime volte per <b>{m.controparte ?? 'questa controparte'}</b>
              <span className="block text-xs text-gray-400">Solo per chi non manderà mai una fattura: stipendi, rimborsi, tasse.</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => {
                if (await onIgnora(nota, sempre)) setIgnorando(false)
              }}
              disabled={inCorso}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Conferma
            </button>
            <button onClick={() => setIgnorando(false)} className="rounded-xl px-3 py-2 text-sm text-gray-500 underline underline-offset-2">
              Lascia stare
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function Sistemato({ m, inCorso, onAnnulla }: { m: Movimento; inCorso: boolean; onAnnulla: () => Promise<boolean> }) {
  const [conferma, setConferma] = useState(false)
  return (
    <li className="rounded-lg border border-gray-100 px-3 py-2 space-y-1">
      <Testa m={m} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        {m.abbinamento === 'ignorato' ? (
          <Pill text="non serve fattura" tono="neutro" />
        ) : (
          <Pill text={m.modo === 'auto' ? 'abbinato in automatico' : 'abbinato a mano'} tono="verde" />
        )}
        <span>
          {m.modo === 'auto' ? 'dall’app' : m.abbinatoDa} · {quando(m.abbinatoIl)}
        </span>
      </div>
      {m.nota && <p className="text-xs text-gray-500">{m.nota}</p>}
      {m.scadenze.map((s) => (
        <p key={s.id} className="text-xs text-gray-600">
          → {s.fornitore} {s.numero ? `· fattura ${s.numero}` : ''} · {euro(s.importo)}
        </p>
      ))}
      <p className="text-xs">
        {conferma ? (
          <>
            <button onClick={() => void onAnnulla()} disabled={inCorso} className="font-semibold text-red-600 underline underline-offset-2">
              Sì, annulla
            </button>
            <span className="mx-1 text-gray-300">·</span>
            <button onClick={() => setConferma(false)} className="text-gray-500 underline underline-offset-2">
              no
            </button>
          </>
        ) : (
          <button onClick={() => setConferma(true)} className="text-gray-400 underline underline-offset-2 hover:text-gray-600">
            Annulla
          </button>
        )}
      </p>
    </li>
  )
}
