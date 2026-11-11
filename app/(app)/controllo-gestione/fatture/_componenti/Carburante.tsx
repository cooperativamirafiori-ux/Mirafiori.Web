'use client'

/**
 * Le parti "carburante" della schermata Fatture del servizio:
 *
 *  - `LeggiCarburante`: riquadro per chi vede tutto, con "Leggi i file adesso"
 *    (la cartella si legge comunque ogni notte);
 *  - `DivisioneCarburante`: la divisione di una fattura fra i servizi, aperta
 *    sotto la riga.
 *
 * Regole in lib/carburante/ e docs/carburante.md.
 */

import { useState } from 'react'
import { Banner } from '@/components/ui/Banner'

const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const dataIt = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('it-IT')

interface Dettaglio {
  stato: 'divisa' | 'in_attesa' | null
  nota: string | null
  quote: Array<{ cc: string; importo: number; rifornimenti: number }>
  rifornimenti: Array<{
    protocollo: string
    data: string
    targa: string | null
    prodotto: string | null
    litri: number | null
    imponibile: number
    cc: string | null
    ccFile: string | null
  }>
}

export function LeggiCarburante({ dopo }: { dopo: () => Promise<void> }) {
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState('')
  const [errore, setErrore] = useState('')
  const [avvisi, setAvvisi] = useState<string[]>([])

  async function leggi() {
    setInCorso(true)
    setEsito('')
    setErrore('')
    setAvvisi([])
    try {
      const res = await fetch('/api/carburante', { method: 'PUT' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Lettura non riuscita')
      const nuovi = (j.file as Array<{ nome: string; esito: string; righe: number; avvisi: string[] }>).filter(
        (f) => f.esito !== 'invariato',
      )
      setEsito(
        (nuovi.length
          ? `Letti ${nuovi.length} file (${j.rifornimenti} rifornimenti).`
          : 'Nessun file nuovo o cambiato nella cartella.') +
          ` Fatture carburante: ${j.divise} divise, ${j.inAttesa} in attesa.` +
          (j.fattureSegnate ? ` ${j.fattureSegnate} fatture nuove riconosciute dal fornitore.` : ''),
      )
      setAvvisi(nuovi.flatMap((f) => f.avvisi.map((a) => `${f.nome}: ${a}`)))
      await dopo()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Lettura non riuscita')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600 min-w-0 flex-1">
          <span className="font-semibold text-gray-800">Carburante.</span> Le fatture segnate «Carburante» le paga
          l&apos;Amministrazione e si dividono fra i servizi con i file mensili in{' '}
          <span className="whitespace-nowrap">General/schede carburante</span>. La cartella si legge ogni notte.
        </p>
        <button
          onClick={() => void leggi()}
          disabled={inCorso}
          className="w-full sm:w-auto rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40"
        >
          {inCorso ? 'Lettura…' : 'Leggi i file adesso'}
        </button>
      </div>
      <Banner tono="errore">{errore}</Banner>
      <Banner tono="ok">{esito}</Banner>
      {avvisi.length > 0 && (
        <ul className="text-xs text-amber-800 list-disc pl-5 space-y-0.5">
          {avvisi.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function DivisioneCarburante({ id, nomeCc }: { id: string; nomeCc: (c: string) => string }) {
  const [aperta, setAperta] = useState(false)
  const [d, setD] = useState<Dettaglio | null>(null)
  const [errore, setErrore] = useState('')

  async function apri() {
    const ora = !aperta
    setAperta(ora)
    if (!ora || d) return
    try {
      const res = await fetch(`/api/carburante?fattura=${encodeURIComponent(id)}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Errore di lettura')
      setD(j)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di lettura')
    }
  }

  const nome = (c: string | null) => (c && c !== 'DA_ATTRIBUIRE' ? nomeCc(c) : 'Da attribuire')

  return (
    <div className="mt-1">
      <button onClick={() => void apri()} className="text-xs font-semibold text-slate-600 underline underline-offset-2">
        {aperta ? 'Chiudi la divisione' : 'Vedi la divisione fra i servizi'}
      </button>
      {aperta && (
        <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 space-y-2">
          <Banner tono="errore">{errore}</Banner>
          {!d && !errore && <p className="text-xs text-gray-500">Caricamento…</p>}
          {d && (
            <>
              {d.nota && <p className="text-xs text-gray-600">{d.nota}</p>}
              {d.quote.length > 0 && (
                <ul className="space-y-1">
                  {d.quote.map((q) => (
                    <li key={q.cc} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 break-words text-gray-700">
                        {nome(q.cc)}{' '}
                        <span className="text-xs text-gray-400">
                          ({q.rifornimenti} {q.rifornimenti === 1 ? 'rifornimento' : 'rifornimenti'})
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-gray-800">{euro(q.importo)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {d.rifornimenti.length > 0 && (
                <details className="text-xs text-gray-600">
                  <summary className="cursor-pointer font-semibold">Rifornimenti ({d.rifornimenti.length})</summary>
                  <ul className="mt-1 space-y-1">
                    {d.rifornimenti.map((r) => (
                      <li key={r.protocollo} className="flex flex-wrap justify-between gap-x-3">
                        <span>
                          {dataIt(r.data)} · {r.targa ?? 'senza targa'} · {r.prodotto ?? ''}
                          {r.litri !== null ? ` ${r.litri.toLocaleString('it-IT')} L` : ''}
                        </span>
                        <span>
                          {r.cc ? nome(r.cc) : `«${r.ccFile ?? 'vuoto'}» non riconosciuto`} · {euro(r.imponibile)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
