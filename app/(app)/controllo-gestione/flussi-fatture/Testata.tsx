'use client'

/**
 * La testata dei Flussi fatture: da quanto i dati non si aggiornano, e il
 * tasto che legge subito la cartella delle fatture XML.
 *
 * Le fatture arrivano dagli XML dello SDI che vengono messi nella cartella
 * SharePoint "General/fatture da SDI" (sito Controllo di Gestione). L'app la
 * legge da sola ogni notte; "Importa adesso" serve quando non si vuole
 * aspettare. Lo scadenzario Excel di Fattura SMART non serve più.
 */

import { useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import type { RicevutaImport } from '@/types/pagamenti'
import type { RicevutaSdi } from '@/lib/pagamenti/sdi/import'

const euroEsatto = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

export function StatoDati({ ultimo }: { ultimo: RicevutaImport | null }) {
  if (!ultimo) {
    return (
      <Banner tono="avviso">
        Nessuna fattura ancora importata. Metti gli XML dello SDI nella cartella SharePoint{' '}
        <b>fatture da SDI</b> e premi <b>Importa adesso</b>.
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
      Ultimo import{' '}
      <b>{giorni === 0 ? 'oggi' : giorni === 1 ? 'ieri' : `${giorni} giorni fa`}</b> (
      {new Date(ultimo.caricatoIl).toLocaleDateString('it-IT')}) · soglia di approvazione{' '}
      {euroEsatto(ultimo.soglia)}
      {vecchio && ' · nessuna fattura nuova da una settimana: la cartella è stata aggiornata?'}
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

export function ImportaSdi({
  onFatto,
  setErrore,
}: {
  onFatto: () => Promise<void>
  setErrore: (s: string) => void
}) {
  const [inCorso, setInCorso] = useState(false)
  const [ricevuta, setRicevuta] = useState<RicevutaSdi | null>(null)

  async function importa() {
    setInCorso(true)
    setErrore('')
    setRicevuta(null)
    try {
      const res = await fetch('/api/pagamenti/importa-sdi', { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Import non riuscito')
      setRicevuta(j.ricevuta)
      await onFatto()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Import non riuscito')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-800">Fatture dallo SDI</h3>
          <p className="text-sm text-gray-500">
            L’app legge da sola la cartella <b>fatture da SDI</b> ogni notte. Premi qui se hai
            appena aggiunto dei file.
          </p>
        </div>
        <button
          onClick={importa}
          disabled={inCorso}
          className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {inCorso ? 'Importo… (fino a qualche minuto)' : 'Importa adesso'}
        </button>
      </div>

      {ricevuta && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
          {ricevuta.fileLetti === 0 ? (
            <b>Nessun file nuovo nella cartella.</b>
          ) : (
            <>
              <b>{ricevuta.fatture} fatture lette</b> · {ricevuta.nuove} nuove ·{' '}
              {ricevuta.raccordate} già note · {ricevuta.giaImportate} già importate
              {ricevuta.perStato.da_verificare
                ? ` · ${ricevuta.perStato.da_verificare} da verificare`
                : ''}
              {ricevuta.bloccate > 0 && ` · ${ricevuta.bloccate} bloccate per l’IBAN`}
            </>
          )}
          {ricevuta.rimasti > 0 && (
            <p className="mt-1 text-amber-700">
              {ricevuta.rimasti} file non letti per limite di tempo: premi di nuovo.
            </p>
          )}
          {[...ricevuta.scartate, ...ricevuta.errori].length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-amber-700">
              {[...ricevuta.scartate, ...ricevuta.errori].map((a, i) => (
                <li key={i} className="break-words">
                  {a.file}: {a.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
