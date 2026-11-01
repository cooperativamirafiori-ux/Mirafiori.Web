'use client'

/**
 * Una richiesta in "Le mie richieste": sopra il riassunto di sempre, sotto —
 * toccando "Messaggi e cose da fare" — la conversazione con chi gestisce le
 * manutenzioni e le righe da fare. Il richiedente può scrivere e aggiungere
 * righe, non spuntarle.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RichiestaManutenzione } from '@/types/manutenzioni'
import { StatoBadge } from '@/components/ui/StatoBadge'
import { Pratica } from '@/components/manutenzioni/Pratica'

export function RichiestaRichiedente({
  richiesta: r,
  nonLetti = 0,
  apertaAllInizio = false,
}: {
  richiesta: RichiestaManutenzione
  nonLetti?: number
  apertaAllInizio?: boolean
}) {
  const [aperta, setAperta] = useState(apertaAllInizio)
  const [daLeggere, setDaLeggere] = useState(nonLetti)
  const segnaLetti = useCallback(() => setDaLeggere(0), [])
  const scheda = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (apertaAllInizio) scheda.current?.scrollIntoView({ block: 'start' })
  }, [apertaAllInizio])

  return (
    <div ref={scheda} className="bg-white rounded-xl shadow px-5 py-4 space-y-2 scroll-mt-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-semibold text-primary-dark">{r.idRichiesta}</span>
          <span className="text-gray-400 text-xs ml-2">
            {r.dataRichiesta ? new Date(r.dataRichiesta).toLocaleDateString('it-IT') : '—'}
          </span>
        </div>
        <StatoBadge stato={r.stato} />
      </div>

      <p className="text-sm text-gray-600 font-medium">{r.struttura.value}</p>
      <p className="text-sm text-gray-500">
        {r.tipoIntervento} · {r.priorita}
      </p>
      <p className={`text-sm text-gray-500 whitespace-pre-line ${aperta ? '' : 'line-clamp-2'}`}>{r.descrizione}</p>

      {r.lungoCorso && r.stato !== 'Completata' && (
        <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1 inline-block">
          ⏳ Lavoro di lungo corso{r.previsioneLungoCorso ? ` · previsione: ${r.previsioneLungoCorso}` : ''}
        </p>
      )}

      {r.tecnico && (
        <p className="text-xs text-gray-400">
          Tecnico assegnato: {r.tecnico.value}
          {r.tecnicoTelefono ? ` · 📞 ${r.tecnicoTelefono}` : ''}
        </p>
      )}

      <button
        onClick={() => setAperta((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-primary-dark hover:bg-gray-50"
        aria-expanded={aperta}
      >
        <span className="font-medium">
          Messaggi e cose da fare
          {daLeggere > 0 && (
            <span className="ml-2 text-xs font-semibold text-white bg-primary px-2 py-0.5 rounded-full">
              {daLeggere === 1 ? '1 nuovo' : `${daLeggere} nuovi`}
            </span>
          )}
        </span>
        <span className="text-gray-400">{aperta ? '▲' : '▼'}</span>
      </button>

      {aperta && (
        <Pratica spItemId={r.spItemId} come="richiedente" completata={r.stato === 'Completata'} onLetti={segnaLetti} />
      )}

      {/* Separatore giallo — riprende il design Power Apps */}
      <div className="h-0.5 bg-accent-yellow rounded-full mt-1" />
    </div>
  )
}
