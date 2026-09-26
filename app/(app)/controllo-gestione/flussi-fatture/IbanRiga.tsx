'use client'

/**
 * L'IBAN su una riga da pagare a bonifico, e i due gesti che lo sbloccano.
 *
 *  - IBAN mancante → lo si scrive (controllo delle cifre prima di salvarlo)
 *  - IBAN cambiato → lo si conferma, ma solo dopo averlo verificato al
 *    telefono con un numero che NON viene dalla fattura. È la truffa più
 *    comune sui fornitori: una mail o una fattura con "le nuove coordinate".
 *
 * La conferma vale per il fornitore: sblocca tutte le sue scadenze non pagate.
 */

import { useState } from 'react'
import type { RigaScadenza } from '@/types/pagamenti'

const aGruppi = (iban: string) => iban.replace(/(.{4})/g, '$1 ').trim()

export function IbanRiga({
  r,
  puoConfermare,
  onFatto,
}: {
  r: RigaScadenza
  puoConfermare: boolean
  onFatto: () => Promise<void>
}) {
  const [aperto, setAperto] = useState(false)
  const [valore, setValore] = useState('')
  const [verificato, setVerificato] = useState(false)
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')
  const [copiato, setCopiato] = useState(false)

  async function conferma(iban: string) {
    if (!r.piva) return
    setInCorso(true)
    setErrore('')
    try {
      const res = await fetch('/api/pagamenti/fornitori/iban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piva: r.piva, iban }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Conferma non riuscita')
      setAperto(false)
      await onFatto()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Conferma non riuscita')
    } finally {
      setInCorso(false)
    }
  }

  async function copia() {
    if (!r.iban) return
    try {
      await navigator.clipboard.writeText(r.iban)
      setCopiato(true)
      setTimeout(() => setCopiato(false), 1500)
    } catch {
      // Niente appunti (http, permessi): l'IBAN resta leggibile e selezionabile.
    }
  }

  return (
    <div className="mt-1 text-xs">
      {r.iban && (
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-gray-700 break-all select-all">{aGruppi(r.iban)}</span>
          <button onClick={copia} className="text-gray-400 underline underline-offset-2">
            {copiato ? 'copiato' : 'copia'}
          </button>
        </p>
      )}

      {r.blocco && puoConfermare && r.piva && !aperto && (
        <button
          onClick={() => setAperto(true)}
          className="mt-1 font-semibold text-red-700 underline underline-offset-2"
        >
          {r.blocco === 'iban_mancante' ? 'Inserisci l’IBAN del fornitore' : 'Verifica il nuovo IBAN'}
        </button>
      )}

      {aperto && r.blocco === 'iban_mancante' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={valore}
            onChange={(e) => setValore(e.target.value)}
            placeholder="IT00 X000 0000 0000 0000 0000 000"
            className="w-full sm:w-80 rounded-lg border border-gray-300 px-2 py-1 font-mono text-sm"
            autoComplete="off"
          />
          <button
            onClick={() => void conferma(valore)}
            disabled={inCorso || valore.replace(/\s/g, '').length < 15}
            className="rounded-lg bg-slate-700 px-3 py-1 text-sm font-semibold text-white disabled:opacity-40"
          >
            Salva
          </button>
          <button onClick={() => setAperto(false)} className="text-gray-500 underline underline-offset-2">
            annulla
          </button>
        </div>
      )}

      {aperto && r.blocco === 'iban_cambiato' && r.iban && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 space-y-2">
          <p className="text-red-800">
            La fattura porta un IBAN diverso da quello confermato. Prima di accettarlo chiama il
            fornitore a un numero che hai già, <b>non</b> a quello scritto in fattura o nella mail.
          </p>
          <label className="flex items-start gap-2 text-red-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={verificato}
              onChange={(e) => setVerificato(e.target.checked)}
            />
            Ho verificato al telefono: il nuovo IBAN è giusto
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => void conferma(r.iban!)}
              disabled={inCorso || !verificato}
              className="rounded-lg bg-red-700 px-3 py-1 text-sm font-semibold text-white disabled:opacity-40"
            >
              Conferma il nuovo IBAN
            </button>
            <button onClick={() => setAperto(false)} className="text-gray-500 underline underline-offset-2">
              annulla
            </button>
          </div>
        </div>
      )}

      {errore && <p className="mt-1 text-red-700">{errore}</p>}
    </div>
  )
}
