'use client'

/**
 * Card "Link donazioni" della home (sezione Servizi): mostra il link alla
 * pagina donazioni di Amazing, con Copia sempre e Condividi solo dove il
 * browser lo sa fare (in pratica da smartphone: apre WhatsApp, mail, ecc.).
 */

import { useEffect, useState } from 'react'

const URL_DONAZIONI = 'https://amazing-mirafiori.vercel.app/dona'

export function LinkDonazioniCard() {
  const [copiato, setCopiato] = useState(false)
  const [puoCondividere, setPuoCondividere] = useState(false)

  // navigator.share esiste solo lato browser: lo si guarda dopo il montaggio
  // per non avere differenze fra server e client.
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
      // L'utente ha chiuso il pannello di condivisione: niente da fare.
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border-l-4 border-brand-cyan-dark bg-brand-cyan/10 p-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl text-white shrink-0 bg-brand-cyan-dark">
        💝
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-gray-800 leading-tight">Link donazioni</h3>
        <a
          href={URL_DONAZIONI}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-brand-cyan-dark underline-offset-2 hover:underline mt-0.5 break-all select-all"
        >
          amazing-mirafiori.vercel.app/dona
        </a>
        <p className="text-sm text-gray-600 mt-2">
          Questo è il link che puoi utilizzare e girare ad amici, conoscenti e parenti per
          ricevere donazioni. Se ritieni che sia importante ricevere una donazione per un
          progetto particolare della cooperativa e vuoi dare la possibilità di scelta, puoi
          contattare{' '}
          <a
            href="mailto:presidenza@cooperativamirafiori.com"
            className="font-semibold text-brand-cyan-dark underline-offset-2 hover:underline break-all"
          >
            presidenza@cooperativamirafiori.com
          </a>
          .
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            onClick={copia}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
          >
            {copiato ? '✓ Copiato' : '📋 Copia'}
          </button>
          {puoCondividere && (
            <button
              type="button"
              onClick={condividi}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-cyan-dark text-white hover:opacity-90"
            >
              📤 Condividi
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
