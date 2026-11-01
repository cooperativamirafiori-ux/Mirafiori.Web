'use client'

/**
 * Percentuali con cui i costi di cc23 (Progettazione - Amministrazione) si
 * dividono fra i servizi. Ogni salvataggio è una versione con la sua data di
 * inizio: le versioni prima restano per i mesi passati.
 * Piano: docs/servizi-interni-piano.md.
 */

import { useEffect, useMemo, useState } from 'react'
import type { CentroScelta, RipartizioneGenerali } from '@/types/servizi-interni'
import { Banner } from '@/components/ui/Banner'

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const numero = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'))
const virgola = (n: number) => String(n).replace('.', ',')
const meseIt = (d: string) => new Date(`${d.slice(0, 7)}-15T12:00:00`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
const prossimoMese = () => {
  const d = new Date()
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

export function Percentuali() {
  const [ccOrigine, setCcOrigine] = useState('cc23')
  const [centri, setCentri] = useState<CentroScelta[] | null>(null)
  const [versioni, setVersioni] = useState<RipartizioneGenerali[]>([])
  const [valori, setValori] = useState<Record<string, string>>({})
  const [dal, setDal] = useState(prossimoMese())
  const [note, setNote] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/servizi-interni/ripartizione')
        const j = await res.json()
        if (!res.ok) throw new Error(j.error ?? 'Errore')
        setCcOrigine(j.ccOrigine)
        setCentri(j.centri)
        setVersioni(j.versioni)
        const ultima: RipartizioneGenerali | undefined = j.versioni[0]
        if (ultima) setValori(Object.fromEntries(ultima.quote.map((q) => [q.ccCodice, virgola(q.percentuale)])))
      } catch (e: any) {
        setErrore(`Non riesco a leggere le percentuali: ${e.message}`)
      }
    })()
  }, [])

  const destinatari = useMemo(() => (centri ?? []).filter((c) => c.codice !== ccOrigine), [centri, ccOrigine])
  const somma = useMemo(
    () => Math.round(destinatari.reduce((s, c) => s + (valori[c.codice]?.trim() ? numero(valori[c.codice]) || 0 : 0), 0) * 1000) / 1000,
    [destinatari, valori],
  )
  const nonValide = destinatari.filter((c) => valori[c.codice]?.trim() && !(numero(valori[c.codice]) >= 0))
  const cento = Math.abs(somma - 100) <= 0.01

  function dividiInParti() {
    if (!destinatari.length) return
    const base = Math.floor((100 / destinatari.length) * 100) / 100
    const resto = Math.round((100 - base * destinatari.length) * 100) / 100
    setValori(Object.fromEntries(destinatari.map((c, i) => [c.codice, virgola(i === 0 ? Math.round((base + resto) * 100) / 100 : base)])))
  }

  async function salva() {
    setInvio(true); setErrore(null); setOk(null)
    try {
      const quote = destinatari
        .filter((c) => valori[c.codice]?.trim())
        .map((c) => ({ ccCodice: c.codice, percentuale: numero(valori[c.codice]) }))
      const res = await fetch('/api/servizi-interni/ripartizione', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dal: `${dal}-01`, quote, note: note.trim() || null }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Errore')
      setVersioni(j.versioni)
      setNote('')
      setOk(`Percentuali salvate: valgono da ${meseIt(dal)}.`)
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setInvio(false)
    }
  }

  if (!centri) return errore ? <Banner tono="errore">{errore}</Banner> : <p className="text-sm text-gray-400">Caricamento…</p>

  const nomeCc = (c: string) => centri.find((x) => x.codice === c)?.nome ?? c

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Costi generali</h2>
        <p className="text-gray-500 text-sm mt-1">
          I costi dell'amministrazione stanno su <strong>{ccOrigine} · {nomeCc(ccOrigine)}</strong>. Qui decidi con che
          percentuale si dividono fra i servizi. La somma deve fare 100%; un servizio senza percentuale non riceve niente.
        </p>
      </div>

      <Banner tono="info">
        Ogni volta che salvi nasce una nuova versione, valida dal mese che scegli. Le versioni di prima restano per i
        mesi passati: cambiare le percentuali non riscrive il passato.
      </Banner>
      <Banner tono="errore">{errore}</Banner>
      <Banner tono="ok">{ok}</Banner>

      <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3" aria-label="Percentuali">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="font-semibold text-gray-800">Percentuali per servizio</p>
          <button onClick={dividiInParti} className="text-sm text-primary font-medium">Dividi in parti uguali</button>
        </div>
        <ul className="divide-y divide-gray-100">
          {destinatari.map((c) => (
            <li key={c.codice} className="flex items-center gap-3 py-2">
              <label htmlFor={`perc-${c.codice}`} className="flex-1 min-w-0 text-sm text-gray-700">
                <span className="text-gray-400 mr-1">{c.codice}</span> {c.nome}
                {c.area && <span className="block text-xs text-gray-400">{c.area}</span>}
              </label>
              <div className="flex items-center gap-1">
                <input id={`perc-${c.codice}`} value={valori[c.codice] ?? ''} inputMode="decimal" placeholder="0"
                  onChange={(e) => setValori({ ...valori, [c.codice]: e.target.value })}
                  className={`${inputCls} w-24 text-right`} />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </li>
          ))}
        </ul>
        <div className={`flex items-baseline justify-between rounded-lg px-3 py-2 ${cento ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
          <span className="text-sm">Totale</span>
          <strong>{somma.toLocaleString('it-IT')}%{cento ? ' ✓' : ` — mancano ${(Math.round((100 - somma) * 1000) / 1000).toLocaleString('it-IT')} punti`}</strong>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block" htmlFor="perc-dal">Valgono da</label>
            <input id="perc-dal" type="month" value={dal} onChange={(e) => setDal(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block" htmlFor="perc-note">Nota (facoltativa)</label>
            <input id="perc-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} maxLength={500} placeholder="es. su base fatturato 2026" />
          </div>
        </div>
        <button onClick={salva} disabled={invio || !cento || nonValide.length > 0 || !dal}
          className="w-full sm:w-auto px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-40">
          {invio ? 'Salvataggio…' : 'Salva percentuali'}
        </button>
      </section>

      <section className="space-y-2" aria-label="Versioni salvate">
        <p className="font-semibold text-gray-700">Versioni salvate</p>
        {versioni.length === 0 ? (
          <p className="text-sm text-gray-400">Nessuna percentuale salvata finora.</p>
        ) : (
          versioni.map((v) => (
            <details key={v.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
              <summary className="cursor-pointer text-sm text-gray-700">
                Da <strong>{meseIt(v.dal)}</strong> · {v.quote.length} servizi · salvata da {v.creatoDa}
                {v.note ? ` · ${v.note}` : ''}
              </summary>
              <ul className="mt-2 text-sm text-gray-600 space-y-0.5">
                {v.quote.map((q) => (
                  <li key={q.ccCodice} className="flex justify-between gap-2">
                    <span>{q.ccCodice} · {nomeCc(q.ccCodice)}</span>
                    <span>{q.percentuale.toLocaleString('it-IT')}%</span>
                  </li>
                ))}
              </ul>
            </details>
          ))
        )}
      </section>
    </div>
  )
}
