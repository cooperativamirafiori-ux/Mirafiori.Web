'use client'

/**
 * Lo storico di un dispositivo o di una SIM: chi l'ha avuto, da quando a quando,
 * su quale centro di costo, con i verbali di consegna e restituzione.
 *
 * È la ragione per cui le assegnazioni sono righe e non un campo sull'anagrafica:
 * la riga in cima, evidenziata, è chi ce l'ha adesso; sotto c'è tutto il resto.
 */

import { useRef, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Pill } from '@/components/ui/Pill'
import { dataBreve } from '@/types/acquisti'
import { MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/core/upload-diretto'
import type { Assegnazione, GenereAssegnazione, TipoVerbale } from '@/types/it'
import { caricaVerbale, restituisci } from './azioni'

const oggi = () => new Date().toISOString().slice(0, 10)

export function Storico({
  genere,
  storico,
  onAggiornata,
  onCorreggi,
}: {
  genere: GenereAssegnazione
  storico: Assegnazione[]
  onAggiornata: (a: Assegnazione) => void
  onCorreggi: (a: Assegnazione) => void
}) {
  if (!storico.length) {
    return (
      <p className="text-xs text-gray-400">
        Nessuna assegnazione: non è mai stato dato a nessuno, o lo storico parte da qui.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {storico.map((a) => (
        <Riga
          key={a.spItemId}
          a={a}
          genere={genere}
          onAggiornata={onAggiornata}
          onCorreggi={onCorreggi}
        />
      ))}
    </ul>
  )
}

function Riga({
  a,
  genere,
  onAggiornata,
  onCorreggi,
}: {
  a: Assegnazione
  genere: GenereAssegnazione
  onAggiornata: (a: Assegnazione) => void
  onCorreggi: (a: Assegnazione) => void
}) {
  const attiva = a.stato === 'Attiva'
  const [chiudendo, setChiudendo] = useState(false)
  const [dataFine, setDataFine] = useState(oggi())
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function conferma() {
    setBusy(true)
    setErrore(null)
    try {
      onAggiornata(await restituisci(genere, a.spItemId, dataFine))
      setChiudendo(false)
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  const chi = a.assegnatarioNome || a.assegnatarioMail || 'in condivisione'
  const senzaPersona = !a.assegnatarioMail

  return (
    <li
      className={`rounded-lg border p-2.5 text-xs ${
        attiva ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800">
            {chi}
            {senzaPersona && <span className="font-normal text-gray-500"> · bene condiviso</span>}
          </p>
          <p className="text-gray-500 mt-0.5">
            dal {dataBreve(a.dataAssegnazione)}
            {a.dataFine ? ` al ${dataBreve(a.dataFine)}` : attiva ? ' · ancora in corso' : ''}
            {a.centroDiCosto?.value ? ` · ${a.centroDiCosto.value}` : ' · senza centro di costo'}
          </p>
          {(a.nomeUtenza || a.servizioLegacy) && (
            <p className="text-gray-400 mt-0.5">
              {[a.nomeUtenza, a.servizioLegacy && `servizio: ${a.servizioLegacy}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {a.note && <p className="text-gray-500 mt-1 whitespace-pre-wrap">{a.note}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Pill text={a.stato} tono={attiva ? 'verde' : 'neutro'} />
        </div>
      </div>

      {/* Verbali */}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <Verbale
          a={a}
          genere={genere}
          tipo="consegna"
          url={a.verbaleConsegnaUrl}
          nome={a.verbaleConsegnaNome}
          abilitato={!senzaPersona}
          onAggiornata={onAggiornata}
        />
        <Verbale
          a={a}
          genere={genere}
          tipo="restituzione"
          url={a.verbaleRestituzioneUrl}
          nome={a.verbaleRestituzioneNome}
          abilitato={!senzaPersona && !attiva}
          onAggiornata={onAggiornata}
        />
      </div>

      {/* Azioni */}
      {attiva && (
        <div className="mt-2 pt-2 border-t border-emerald-100">
          {chiudendo ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-gray-500">
                Restituito il
                <input
                  type="date"
                  value={dataFine}
                  onChange={(e) => setDataFine(e.target.value)}
                  className="ml-1.5 border border-gray-300 rounded-lg px-2 py-1"
                />
              </label>
              <button
                onClick={conferma}
                disabled={busy}
                className="bg-gray-800 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40"
              >
                {busy ? 'Chiudo…' : 'Conferma'}
              </button>
              <button
                onClick={() => setChiudendo(false)}
                className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg"
              >
                Annulla
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setChiudendo(true)}
                className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg font-semibold hover:bg-white"
              >
                Restituito
              </button>
              <button
                onClick={() => onCorreggi(a)}
                className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg"
              >
                Correggi
              </button>
            </div>
          )}
          <Banner tono="errore">{errore}</Banner>
        </div>
      )}
    </li>
  )
}

/**
 * Il verbale: se c'è si apre, se non c'è si carica il firmato.
 *
 * Per i beni condivisi il pulsante non c'è: non c'è nessuno che firma.
 */
function Verbale({
  a,
  genere,
  tipo,
  url,
  nome,
  abilitato,
  onAggiornata,
}: {
  a: Assegnazione
  genere: GenereAssegnazione
  tipo: TipoVerbale
  url?: string
  nome?: string
  abilitato: boolean
  onAggiornata: (a: Assegnazione) => void
}) {
  const rif = useRef<HTMLInputElement>(null)
  const [percentuale, setPercentuale] = useState<number | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700"
      >
        📄 {nome ?? `verbale ${tipo}`}
      </a>
    )
  }
  if (!abilitato) return null

  async function scelto(file: File | null) {
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrore(`Troppo grande: il massimo è ${maxUploadMb()} MB.`)
      return
    }
    setErrore(null)
    setPercentuale(0)
    try {
      onAggiornata(await caricaVerbale(genere, a.spItemId, tipo, file, setPercentuale))
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setPercentuale(null)
      if (rif.current) rif.current.value = ''
    }
  }

  return (
    <>
      <button
        onClick={() => rif.current?.click()}
        disabled={percentuale != null}
        className="px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:bg-white disabled:opacity-50"
      >
        {percentuale != null ? `carico… ${percentuale}%` : `＋ verbale ${tipo} firmato`}
      </button>
      <input
        ref={rif}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => scelto(e.target.files?.[0] ?? null)}
      />
      {errore && <span className="text-red-600">{errore}</span>}
    </>
  )
}
