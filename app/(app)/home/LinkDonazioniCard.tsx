'use client'

/**
 * Card "Link donazioni" della home (sezione Servizi): sembra una card come le
 * altre, ma invece di navigare apre una finestra con la spiegazione, il link,
 * Copia sempre e Condividi solo dove il browser lo sa fare (in pratica da
 * smartphone: apre WhatsApp, mail, ecc.).
 */

import { useCallback, useEffect, useState } from 'react'
import { Modale } from '@/components/ui/Modale'

const URL_DONAZIONI = 'https://amazing-mirafiori.vercel.app/dona'
const MAIL_PRESIDENZA = 'presidenza@cooperativamirafiori.com'

export function LinkDonazioniCard() {
  const [aperta, setAperta] = useState(false)
  const chiudi = useCallback(() => setAperta(false), [])

  return (
    <>
      <button
        type="button"
        onClick={() => setAperta(true)}
        className="group flex items-center gap-3 rounded-xl border-l-4 border-brand-cyan-dark bg-brand-cyan/10 p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl text-white shrink-0 bg-brand-cyan-dark">
          💝
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-gray-800 leading-tight">Link donazioni</h3>
          <p className="text-sm text-gray-500 mt-0.5">Copia o condividi il link per donare</p>
        </div>
        <span className="text-xl text-brand-cyan-dark opacity-60 group-hover:translate-x-1 group-hover:opacity-100 transition-all shrink-0">
          →
        </span>
      </button>

      {aperta && <FinestraDonazioni onChiudi={chiudi} />}
    </>
  )
}

function FinestraDonazioni({ onChiudi }: { onChiudi: () => void }) {
  const [copiato, setCopiato] = useState(false)
  const [puoCondividere, setPuoCondividere] = useState(false)

  useEffect(() => {
    setPuoCondividere(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  async function copia() {
    try {
      await navigator.clipboard.writeText(URL_DONAZIONI)
      setCopiato(true)
      setTimeout(() => setCopiato(false), 2000)
    } catch {
      // Clipboard negato: il link resta selezionabile a mano.
    }
  }

  async function condividi() {
    try {
      await navigator.share({
        title: 'Dona a Cooperativa Mirafiori',
        text: 'Sostieni Cooperativa Mirafiori con una donazione:',
        url: URL_DONAZIONI,
      })
    } catch {
      // Pannello di condivisione chiuso: niente da fare.
    }
  }

  return (
    <Modale
      titolo="Link donazioni"
      onChiudi={onChiudi}
      azioni={
        <>
          <button
            type="button"
            onClick={copia}
            className="flex-1 font-semibold px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
          >
            {copiato ? '✓ Copiato' : '📋 Copia link'}
          </button>
          {puoCondividere && (
            <button
              type="button"
              onClick={condividi}
              className="flex-1 font-semibold px-4 py-2.5 rounded-xl bg-brand-cyan-dark text-white hover:opacity-90"
            >
              📤 Condividi
            </button>
          )}
        </>
      }
    >
      <p className="text-sm text-gray-600">
        Questo è il link che puoi utilizzare e girare ad amici, conoscenti e parenti per ricevere
        donazioni.
      </p>

      <a
        href={URL_DONAZIONI}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-3 rounded-xl bg-brand-cyan/10 px-4 py-3 font-mono text-sm text-brand-cyan-dark break-all select-all hover:underline"
      >
        {URL_DONAZIONI}
      </a>

      <p className="text-sm text-gray-600 mt-4">
        Se ritieni che sia importante ricevere una donazione per un progetto particolare della
        cooperativa e vuoi dare la possibilità di scelta, puoi contattare{' '}
        <a
          href={`mailto:${MAIL_PRESIDENZA}`}
          className="font-semibold text-brand-cyan-dark hover:underline break-all"
        >
          {MAIL_PRESIDENZA}
        </a>
        .
      </p>
    </Modale>
  )
}
