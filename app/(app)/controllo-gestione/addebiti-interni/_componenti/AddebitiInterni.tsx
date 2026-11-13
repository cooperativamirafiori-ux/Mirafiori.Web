'use client'

/**
 * Addebiti interni: un servizio addebita a un altro il lavoro fatto per lui.
 * Ore di lavoro × forfait (18 €/h, uguale per tutti) + altri costi descritti.
 * Piano: docs/servizi-interni-piano.md.
 *
 * Costo esterno (13/11/2026): senza servizio di partenza, per allocare a un
 * servizio un bonifico fatto senza fattura. Solo "Controllo di Gestione",
 * niente ore, solo costi.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { NOME_COSTO_ESTERNO, ORIGINI_ADDEBITO, type AddebitoInterno, type AltroCosto, type CentroScelta } from '@/types/servizi-interni'
import { Banner } from '@/components/ui/Banner'
import { Kpi } from '@/components/ui/Kpi'
import { Vuoto } from '@/components/ui/Vuoto'

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50'
const labelCls = 'text-xs text-gray-500 mb-1 block'
const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const meseIt = (m: string) => new Date(`${m.slice(0, 7)}-15T12:00:00`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
const numero = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'))
const virgola = (n: number) => String(n).replace('.', ',')
/** Valore della tendina "Chi ha fatto il lavoro" per un costo esterno (ccDa null). */
const ESTERNO = '__esterno'

/** Primo mese ancora aperto: il precedente fino al 10, poi il corrente. Stessa regola del server. */
function primoMeseAperto(oggi = new Date()): string {
  const d = new Date(oggi.getFullYear(), oggi.getMonth() - (oggi.getDate() <= 10 ? 1 : 0), 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const meseCorrente = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface Dati {
  anno: number
  addebiti: AddebitoInterno[]
  centri: CentroScelta[]
  forfait: Array<{ dal: string; euroOra: number }>
  tutti: boolean
  mieiCentri: string[]
}

type Vista = 'fatti' | 'ricevuti' | 'tutti'

interface Bozza {
  id: string | null
  ccDa: string
  ccA: string
  mese: string
  descrizione: string
  ore: string
  altri: Array<{ descrizione: string; importo: string }>
}

export function AddebitiInterni({ apri }: { apri?: string }) {
  const [dati, setDati] = useState<Dati | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('fatti')
  const [mese, setMese] = useState('')
  const [bozza, setBozza] = useState<Bozza | null>(null)
  const [invio, setInvio] = useState(false)
  const [daTogliere, setDaTogliere] = useState<string | null>(null)
  const [notaPer, setNotaPer] = useState<string | null>(null)
  const [nota, setNota] = useState('')

  const carica = useCallback(async () => {
    try {
      const res = await fetch(`/api/servizi-interni/addebiti?anno=${new Date().getFullYear()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Errore')
      setDati(j)
      if (apri) {
        const a = (j.addebiti as AddebitoInterno[]).find((x) => x.id === apri)
        if (a && !j.tutti && j.mieiCentri.includes(a.ccA) && (a.ccDa == null || !j.mieiCentri.includes(a.ccDa))) setVista('ricevuti')
        if (j.tutti) setVista('tutti')
      } else if (j.tutti) setVista('tutti')
    } catch (e: any) {
      setErrore(`Non riesco a leggere gli addebiti: ${e.message}`)
    }
  }, [apri])

  useEffect(() => { carica() }, [carica])

  useEffect(() => {
    if (apri && dati) document.getElementById(`addebito-${apri}`)?.scrollIntoView({ block: 'center' })
  }, [apri, dati])

  const nome = useCallback(
    (c: string | null) => (c == null ? NOME_COSTO_ESTERNO : dati?.centri.find((x) => x.codice === c)?.nome ?? c),
    [dati],
  )
  const miei = useMemo(() => new Set(dati?.mieiCentri ?? []), [dati])

  const forfaitOggi = useMemo(() => {
    const f = [...(dati?.forfait ?? [])].sort((a, b) => b.dal.localeCompare(a.dal))[0]
    return f ?? null
  }, [dati])

  const visibili = useMemo(() => {
    const tutti = dati?.addebiti ?? []
    return tutti
      .filter((a) => (vista === 'fatti' ? a.ccDa != null && miei.has(a.ccDa) : vista === 'ricevuti' ? miei.has(a.ccA) : true))
      .filter((a) => !mese || a.mese.startsWith(mese))
  }, [dati, vista, mese, miei])

  const totale = (righe: AddebitoInterno[]) => righe.reduce((s, a) => s + (a.totale ?? 0), 0)
  const fatti = (dati?.addebiti ?? []).filter((a) => a.ccDa != null && miei.has(a.ccDa) && (!mese || a.mese.startsWith(mese)))
  const ricevuti = (dati?.addebiti ?? []).filter((a) => miei.has(a.ccA) && (!mese || a.mese.startsWith(mese)))
  const daVistare = ricevuti.filter((a) => !a.visto).length

  function nuovo() {
    const mioPrimo = dati?.tutti ? '' : (dati?.mieiCentri[0] ?? '')
    setBozza({ id: null, ccDa: dati?.mieiCentri.length === 1 ? mioPrimo : '', ccA: '', mese: meseCorrente(), descrizione: '', ore: '', altri: [] })
    setErrore(null); setOk(null)
  }

  function modifica(a: AddebitoInterno) {
    setBozza({
      id: a.id, ccDa: a.ccDa ?? ESTERNO, ccA: a.ccA, mese: a.mese.slice(0, 7), descrizione: a.descrizione,
      ore: a.ore ? virgola(a.ore) : '', altri: a.altriCosti.map((c) => ({ descrizione: c.descrizione, importo: virgola(c.importo) })),
    })
    setErrore(null); setOk(null)
    setTimeout(() => document.getElementById('modulo-addebito')?.scrollIntoView({ block: 'start' }), 50)
  }

  const esternoBozza = bozza?.ccDa === ESTERNO
  const oreBozza = bozza && !esternoBozza && bozza.ore.trim() ? numero(bozza.ore) : 0
  const altriBozza: AltroCosto[] = (bozza?.altri ?? []).map((c) => ({ descrizione: c.descrizione, importo: c.importo.trim() ? numero(c.importo) : NaN }))
  const totaleBozza = (Number.isFinite(oreBozza) ? oreBozza : 0) * (forfaitOggi?.euroOra ?? 0)
    + altriBozza.reduce((s, c) => s + (Number.isFinite(c.importo) ? c.importo : 0), 0)

  async function salva() {
    if (!bozza) return
    if (!Number.isFinite(oreBozza) || oreBozza < 0) { setErrore('Le ore non sono valide (es. 3,5)'); return }
    setInvio(true); setErrore(null)
    try {
      const corpo = {
        ccDa: esternoBozza ? null : bozza.ccDa, ccA: bozza.ccA, mese: bozza.mese, descrizione: bozza.descrizione,
        ore: oreBozza, altriCosti: altriBozza,
      }
      const res = await fetch(bozza.id ? `/api/servizi-interni/addebiti/${bozza.id}` : '/api/servizi-interni/addebiti', {
        method: bozza.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Errore')
      setOk(esternoBozza
        ? (bozza.id ? 'Costo esterno modificato: chi lo riceve ha una mail.' : 'Costo esterno attribuito: chi lo riceve ha una mail.')
        : (bozza.id ? 'Addebito modificato: chi lo riceve ha una mail.' : 'Addebito salvato: chi lo riceve ha una mail.'))
      setBozza(null)
      await carica()
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setInvio(false)
    }
  }

  async function togli(id: string) {
    setInvio(true); setErrore(null)
    try {
      const res = await fetch(`/api/servizi-interni/addebiti/${id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Errore')
      setDaTogliere(null)
      await carica()
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setInvio(false)
    }
  }

  async function visto(id: string, valore: 'visto' | 'non_torna' | null, testo?: string) {
    setInvio(true); setErrore(null)
    try {
      const res = await fetch(`/api/servizi-interni/addebiti/${id}/visto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visto: valore, nota: testo ?? null }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Errore')
      setNotaPer(null); setNota('')
      setDati((d) => d && { ...d, addebiti: d.addebiti.map((a) => (a.id === id ? j.addebito : a)) })
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setInvio(false)
    }
  }

  if (!dati) {
    return errore ? <Banner tono="errore">{errore}</Banner> : <p className="text-sm text-gray-400">Caricamento…</p>
  }

  const mesiAnno = Array.from({ length: 12 }, (_, i) => `${dati.anno}-${String(i + 1).padStart(2, '0')}`)
    .filter((m) => m <= meseCorrente())
    .reverse()
  const daScegliere = dati.tutti ? dati.centri : dati.centri.filter((c) => miei.has(c.codice))

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Addebiti interni</h2>
        <p className="text-gray-500 text-sm mt-1">
          Quando il tuo servizio lavora per un altro servizio della cooperativa, glielo addebiti qui:
          ore di lavoro più gli altri costi, ognuno con cosa è.
        </p>
      </div>

      <Banner tono="info">
        <strong>Le ore di lavoro valgono {forfaitOggi ? euro(forfaitOggi.euroOra) : '—'} l'ora</strong>, un forfait uguale per
        tutti i servizi{forfaitOggi ? ` (dal ${new Date(`${forfaitOggi.dal}T12:00:00`).toLocaleDateString('it-IT')})` : ''}.
        Gli altri costi si addebitano al costo, senza ricarico. Chi riceve l'addebito vede tutto e può mettere il visto: il visto serve a dire che l'ha visto, l'addebito vale comunque.
        Un addebito si può modificare fino al 10 del mese dopo; poi si corregge con un addebito nel mese corrente.
      </Banner>

      <Banner tono="errore">{errore}</Banner>
      <Banner tono="ok">{ok}</Banner>

      <div className="grid grid-cols-2 gap-3">
        <Kpi titolo="Addebitato dai tuoi servizi" valore={euro(totale(fatti))} />
        <Kpi titolo={daVistare ? `Ricevuto · ${daVistare} da guardare` : 'Ricevuto dai tuoi servizi'} valore={euro(totale(ricevuti))} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 text-sm" role="tablist">
          {(dati.tutti ? (['tutti', 'fatti', 'ricevuti'] as Vista[]) : (['fatti', 'ricevuti'] as Vista[])).map((v) => (
            <button key={v} role="tab" aria-selected={vista === v} onClick={() => setVista(v)}
              className={`flex-1 rounded-lg px-3 py-2 ${vista === v ? 'bg-white shadow-sm font-semibold text-gray-800' : 'text-gray-500'}`}>
              {v === 'fatti' ? 'Fatti' : v === 'ricevuti' ? 'Ricevuti' : 'Tutti'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={mese} onChange={(e) => setMese(e.target.value)} className={`${inputCls} sm:w-48`} aria-label="Mese">
            <option value="">Tutto l'anno {dati.anno}</option>
            {mesiAnno.map((m) => <option key={m} value={m}>{meseIt(m)}</option>)}
          </select>
          {daScegliere.length > 0 && !bozza && (
            <button onClick={nuovo} className="shrink-0 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark">
              + Nuovo
            </button>
          )}
        </div>
      </div>

      {bozza && (
        <section id="modulo-addebito" className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 scroll-mt-4" aria-label="Addebito">
          <p className="font-semibold text-gray-800">
            {esternoBozza ? (bozza.id ? 'Modifica costo esterno' : 'Nuovo costo esterno') : bozza.id ? 'Modifica addebito' : 'Nuovo addebito'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="ai-da">Chi ha fatto il lavoro</label>
              <select id="ai-da" value={bozza.ccDa} className={inputCls}
                onChange={(e) => {
                  const v = e.target.value
                  // Un costo esterno è fatto solo di costi: ne prepara subito una riga.
                  const altri = v === ESTERNO && bozza.altri.length === 0 ? [{ descrizione: '', importo: '' }] : bozza.altri
                  setBozza({ ...bozza, ccDa: v, altri })
                }}>
                <option value="">— scegli —</option>
                {dati.tutti && <option value={ESTERNO}>Nessuno: costo esterno (es. bonifico senza fattura)</option>}
                {daScegliere.map((c) => <option key={c.codice} value={c.codice}>{c.codice} · {c.nome}</option>)}
              </select>
              {esternoBozza && (
                <p className="text-xs text-gray-500 mt-1">
                  Un costo pagato senza fattura: nel cruscotto pesa solo sul servizio che lo riceve, fra i costi a mano.
                </p>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="ai-a">A chi si addebita</label>
              <select id="ai-a" value={bozza.ccA} onChange={(e) => setBozza({ ...bozza, ccA: e.target.value })} className={inputCls}>
                <option value="">— scegli —</option>
                {dati.centri.filter((c) => c.codice !== bozza.ccDa).map((c) => <option key={c.codice} value={c.codice}>{c.codice} · {c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="ai-mese">Mese</label>
              <input id="ai-mese" type="month" value={bozza.mese} min={primoMeseAperto()} max={meseCorrente()}
                onChange={(e) => setBozza({ ...bozza, mese: e.target.value })} className={inputCls} />
            </div>
            {!esternoBozza && <div>
              <label className={labelCls} htmlFor="ai-ore">Ore di lavoro</label>
              <input id="ai-ore" value={bozza.ore} onChange={(e) => setBozza({ ...bozza, ore: e.target.value })} inputMode="decimal" className={inputCls} placeholder="es. 3,5" />
              <p className="text-xs text-gray-500 mt-1">
                × {forfaitOggi ? euro(forfaitOggi.euroOra) : '—'}/h forfait
                {oreBozza > 0 && forfaitOggi ? ` = ${euro(oreBozza * forfaitOggi.euroOra)}` : ''}
              </p>
            </div>}
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="ai-cosa">{esternoBozza ? 'Che cos\'è' : 'Cosa è stato fatto'}</label>
              <textarea id="ai-cosa" value={bozza.descrizione} onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })}
                className={`${inputCls} resize-none h-20`} maxLength={500}
                placeholder={esternoBozza ? 'es. Bonifico del 5/11 a Mario Rossi per riparazione cancello, senza fattura' : 'es. Trasporto ragazzi alla gita del 12, due educatori'} />
            </div>
          </div>

          <div className="space-y-2">
            <p className={labelCls}>{esternoBozza ? 'Costi: cosa e quanto (almeno uno)' : 'Altri costi (facoltativi): cosa e quanto'}</p>
            {bozza.altri.map((c, i) => (
              <div key={i} className="flex gap-2 flex-wrap sm:flex-nowrap">
                <input value={c.descrizione} aria-label={`Cosa, riga ${i + 1}`} placeholder="es. Carburante"
                  onChange={(e) => setBozza({ ...bozza, altri: bozza.altri.map((x, j) => (j === i ? { ...x, descrizione: e.target.value } : x)) })}
                  className={`${inputCls} flex-1 min-w-0`} maxLength={300} />
                <input value={c.importo} aria-label={`Importo, riga ${i + 1}`} placeholder="€" inputMode="decimal"
                  onChange={(e) => setBozza({ ...bozza, altri: bozza.altri.map((x, j) => (j === i ? { ...x, importo: e.target.value } : x)) })}
                  className={`${inputCls} w-28`} />
                <button onClick={() => setBozza({ ...bozza, altri: bozza.altri.filter((_, j) => j !== i) })}
                  className="text-sm text-gray-400 hover:text-red-600 px-2" aria-label={`Togli riga ${i + 1}`}>Togli</button>
              </div>
            ))}
            <button onClick={() => setBozza({ ...bozza, altri: [...bozza.altri, { descrizione: '', importo: '' }] })}
              className="text-sm text-primary font-medium">+ Altro costo</button>
          </div>

          <div className="flex items-baseline justify-between border-t border-gray-100 pt-3">
            <span className="text-sm text-gray-600">Totale addebito</span>
            <strong className="text-gray-800">{euro(Math.round(totaleBozza * 100) / 100)}</strong>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={salva} disabled={invio} className="flex-1 sm:flex-none px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40">
              {invio ? 'Salvataggio…' : bozza.id ? 'Salva modifiche' : 'Salva addebito'}
            </button>
            <button onClick={() => setBozza(null)} className="flex-1 sm:flex-none px-4 py-2 border border-gray-300 text-sm rounded-lg">Annulla</button>
          </div>
        </section>
      )}

      {visibili.length === 0 ? (
        <Vuoto>{vista === 'ricevuti' ? 'Nessun addebito ricevuto' : 'Nessun addebito'}{mese ? ` in ${meseIt(mese)}` : ` nel ${dati.anno}`}.</Vuoto>
      ) : (
        <ul className="space-y-3">
          {visibili.map((a) => {
            // Gli automatici (Lavori di Cura Ambienti, manutenzioni) si correggono alla loro origine.
            const scrive = (a.ccDa == null ? dati.tutti : miei.has(a.ccDa)) && !a.bloccato && a.origine === 'manuale'
            const vista_ = miei.has(a.ccA)
            return (
              <li key={a.id} id={`addebito-${a.id}`}
                className={`bg-white rounded-2xl border p-4 space-y-2 scroll-mt-4 ${apri === a.id ? 'border-primary ring-2 ring-primary/20' : 'border-gray-100 shadow-sm'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">n. {a.numero} · {meseIt(a.mese)}{a.bloccato ? ' · mese chiuso' : ''}</p>
                    <p className="font-semibold text-gray-800 break-words">{nome(a.ccDa)} <span className="text-gray-400">→</span> {nome(a.ccA)}</p>
                  </div>
                  <strong className="text-gray-800 whitespace-nowrap">{a.totale != null ? euro(a.totale) : '—'}</strong>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-line break-words">{a.descrizione}</p>
                {a.ccDa == null && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                    Pagato senza fattura e attribuito a {nome(a.ccA)}: nel cruscotto è un costo a mano del servizio.
                  </p>
                )}
                {a.origine !== 'manuale' && (
                  <p className="text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-2 py-1 break-words">
                    {ORIGINI_ADDEBITO[a.origine]}{a.strutturaNome ? ` · ${a.strutturaNome}` : ''}: lo scrive l&apos;app e si aggiorna da solo fino al 10 del mese dopo.
                    {a.origine === 'manutenzione' ? ' Si corregge nei Costi della richiesta.' : ' Si corregge nel Lavoro.'}
                  </p>
                )}
                <ul className="text-xs text-gray-600 space-y-0.5">
                  {a.ore > 0 && (
                    <li>Ore di lavoro: {virgola(a.ore)} h × {a.euroOra != null ? euro(a.euroOra) : '—'}/h = {a.euroOra != null ? euro(a.ore * a.euroOra) : 'forfait mancante'}</li>
                  )}
                  {a.altriCosti.map((c, i) => <li key={i}>{c.descrizione}: {euro(c.importo)}</li>)}
                </ul>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {a.visto === 'visto' && <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5">✓ Visto</span>}
                  {a.visto === 'non_torna' && <span className="rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5">Non torna</span>}
                  {!a.visto && <span className="rounded-full bg-gray-50 border border-gray-200 text-gray-500 px-2 py-0.5">Non ancora visto</span>}
                  {a.vistoNota && <span className="text-gray-600 break-words">«{a.vistoNota}»</span>}
                </div>

                {(scrive || vista_) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {vista_ && a.visto !== 'visto' && (
                      <button onClick={() => visto(a.id, 'visto')} disabled={invio}
                        className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white disabled:opacity-40">✓ Visto</button>
                    )}
                    {vista_ && a.visto !== 'non_torna' && notaPer !== a.id && (
                      <button onClick={() => { setNotaPer(a.id); setNota('') }}
                        className="px-3 py-1.5 text-sm rounded-lg border border-amber-300 text-amber-800">Non mi torna</button>
                    )}
                    {vista_ && a.visto && (
                      <button onClick={() => visto(a.id, null)} disabled={invio}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600">Togli il visto</button>
                    )}
                    {scrive && (
                      <button onClick={() => modifica(a)} className="px-3 py-1.5 text-sm rounded-lg border border-primary text-primary">Modifica</button>
                    )}
                    {scrive && (daTogliere === a.id ? (
                      <span className="flex gap-2 items-center text-sm">
                        <button onClick={() => togli(a.id)} disabled={invio} className="text-red-600 font-semibold">Sì, togli</button>
                        <button onClick={() => setDaTogliere(null)} className="text-gray-500">Annulla</button>
                      </span>
                    ) : (
                      <button onClick={() => setDaTogliere(a.id)} className="px-3 py-1.5 text-sm rounded-lg text-gray-500 hover:text-red-600">Togli</button>
                    ))}
                  </div>
                )}

                {notaPer === a.id && (
                  <div className="space-y-2">
                    <textarea value={nota} onChange={(e) => setNota(e.target.value)} className={`${inputCls} resize-none h-16`}
                      placeholder="Cosa non ti torna?" maxLength={1000} aria-label="Cosa non ti torna" />
                    <div className="flex gap-2">
                      <button onClick={() => visto(a.id, 'non_torna', nota.trim())} disabled={invio || !nota.trim()}
                        className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white disabled:opacity-40">Invia</button>
                      <button onClick={() => setNotaPer(null)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300">Annulla</button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
