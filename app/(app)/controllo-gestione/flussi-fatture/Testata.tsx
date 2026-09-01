'use client'

/**
 * La testata dei Flussi fatture: da quanto i dati non si aggiornano, e il
 * caricamento dello scadenzario.
 *
 * Sta in un file suo perché sono le due cose che si guardano *prima* delle
 * code, e perché il cruscotto da solo era già oltre le 500 righe.
 */

import { useRef, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import type { RicevutaImport } from '@/types/pagamenti'

const euroEsatto = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })


export function StatoDati({ ultimo }: { ultimo: RicevutaImport | null }) {
  if (!ultimo) {
    return (
      <Banner tono="avviso">
        Nessuno scadenzario ancora caricato. Scarica da Fattura SMART l’<b>Elenco scadenze</b> e
        trascinalo qui sotto.
      </Banner>
    )
  }
  const giorni = Math.floor((Date.now() - Date.parse(ultimo.caricatoIl)) / 86_400_000)
  const vecchio = giorni >= 8
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        vecchio ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-gray-200 text-gray-600'
      }`}
    >
      Dati aggiornati a{' '}
      <b>
        {giorni === 0 ? 'oggi' : giorni === 1 ? 'ieri' : `${giorni} giorni fa`}
      </b>{' '}
      ({new Date(ultimo.caricatoIl).toLocaleDateString('it-IT')}, {ultimo.nomeFile}) · soglia di
      approvazione {euroEsatto(ultimo.soglia)}
      {vecchio && ' · è ora di ricaricare lo scadenzario'}
      {ultimo.avvisi.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-amber-800">
          {ultimo.avvisi.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Caricamento({
  onFatto,
  setErrore,
}: {
  onFatto: () => Promise<void>
  setErrore: (s: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [decorrenza, setDecorrenza] = useState('')
  // Mai un default acceso: la spunta va rimessa a ogni caricamento, così chi
  // carica sa che sta lasciando decidere al gestionale.
  const [chiusuraGestionale, setChiusuraGestionale] = useState(false)
  const [inCorso, setInCorso] = useState(false)
  const [ricevuta, setRicevuta] = useState<RicevutaImport | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function carica() {
    if (!file) return
    setInCorso(true)
    setErrore('')
    setRicevuta(null)
    try {
      const res = await fetch('/api/pagamenti/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-nome-file': encodeURIComponent(file.name),
          ...(decorrenza ? { 'x-decorrenza': decorrenza } : {}),
          ...(chiusuraGestionale ? { 'x-chiusura-gestionale': '1' } : {}),
        },
        body: await file.arrayBuffer(),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Import fallito')
      setRicevuta(j.ricevuta)
      setFile(null)
      setChiusuraGestionale(false)
      if (input.current) input.current.value = ''
      await onFatto()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Import fallito')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-gray-800">Carica lo scadenzario</h3>
        <p className="text-sm text-gray-500">
          L’<b>Elenco scadenze</b> di Fattura SMART, una volta a settimana. Il file contiene
          sempre tutto: ci pensa l’app a capire cosa è nuovo.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Storiche prima del
          <input
            type="date"
            value={decorrenza}
            onChange={(e) => setDecorrenza(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          onClick={carica}
          disabled={!file || inCorso}
          className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {inCorso ? 'Importo…' : 'Importa'}
        </button>
      </div>
      <p className="text-xs text-gray-400">
        La data è facoltativa: sotto quella le scadenze entrano come storiche — visibili e dentro
        lo scaduto, ma fuori dalle code. Lasciala vuota per farle entrare tutte.
      </p>

      <label className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={chiusuraGestionale}
          onChange={(e) => setChiusuraGestionale(e.target.checked)}
        />
        <span className="text-sm text-gray-600">
          <b>Chiudi le scadenze che il gestionale dà per pagate</b>, con la sua data di pagamento.
          <span className="block text-xs text-gray-400 mt-0.5">
            Serve al primo caricamento, per non spuntare a mano l’arretrato già saldato. Vale in
            una direzione sola: non riapre mai una scadenza chiusa qui dentro. Le righe chiuse
            così restano riconoscibili, perché non le ha guardate nessuno di noi.
          </span>
        </span>
      </label>

      {ricevuta && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
          <b>{ricevuta.righe} righe lette</b> · {ricevuta.nuove} nuove · {ricevuta.aggiornate}{' '}
          aggiornate · {ricevuta.invariate} invariate · {ricevuta.scartate} scartate
          {ricevuta.scomparse > 0 && ` · ${ricevuta.scomparse} non più presenti`}
          {ricevuta.avvisi.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-amber-700">
              {ricevuta.avvisi.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

