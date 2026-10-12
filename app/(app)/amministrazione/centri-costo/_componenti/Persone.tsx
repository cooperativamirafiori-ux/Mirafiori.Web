'use client'

/**
 * Un elenco di persone modificabile: le persone come etichette, una croce per
 * toglierle (con conferma sulla stessa etichetta), "+ Aggiungi" per sceglierne
 * un'altra dalla rubrica. Salva subito: chi chiama riceve l'elenco completo.
 */

import { useState } from 'react'
import { SceltaPersona, type VoceRubrica } from '@/components/ui/SceltaPersona'

export function Persone({
  email,
  rubrica,
  nome,
  occupato,
  vuoto,
  etichettaAggiungi = 'Aggiungi',
  onCambia,
}: {
  email: string[]
  rubrica: VoceRubrica[]
  nome: (email: string) => string
  occupato: boolean
  /** Testo quando non c'è nessuno. */
  vuoto: string
  etichettaAggiungi?: string
  onCambia: (email: string[]) => void
}) {
  const [aggiungo, setAggiungo] = useState(false)
  const [daTogliere, setDaTogliere] = useState<string | null>(null)
  const inRubrica = new Set(rubrica.map((v) => v.email))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {email.length === 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm text-amber-800">
            {vuoto}
          </span>
        )}
        {email.map((e) =>
          daTogliere === e ? (
            <span
              key={e}
              className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm text-red-700"
            >
              Togli {nome(e)}?
              <button
                type="button"
                disabled={occupato}
                onClick={() => {
                  setDaTogliere(null)
                  onCambia(email.filter((x) => x !== e))
                }}
                className="font-semibold underline disabled:opacity-50"
              >
                Sì
              </button>
              <button type="button" onClick={() => setDaTogliere(null)} className="text-red-500">
                No
              </button>
            </span>
          ) : (
            <span
              key={e}
              title={e}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-3 py-1 text-sm ${
                inRubrica.has(e) || rubrica.length === 0
                  ? 'border-slate-200 bg-white text-gray-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              <span className="truncate">{nome(e)}</span>
              {!inRubrica.has(e) && rubrica.length > 0 && (
                <span className="text-[11px] font-semibold">fuori rubrica</span>
              )}
              <button
                type="button"
                aria-label={`Togli ${nome(e)}`}
                disabled={occupato}
                onClick={() => setDaTogliere(e)}
                className="-mr-1 ml-1 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
              >
                ×
              </button>
            </span>
          ),
        )}
        {!aggiungo && (
          <button
            type="button"
            disabled={occupato}
            onClick={() => setAggiungo(true)}
            className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            + {etichettaAggiungi}
          </button>
        )}
        {occupato && <span className="text-xs text-gray-400">salvo…</span>}
      </div>
      {aggiungo && (
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <SceltaPersona
              rubrica={rubrica}
              giaPresenti={email}
              autoFocus
              onScegli={(v) => {
                setAggiungo(false)
                if (!email.includes(v.email)) onCambia([...email, v.email])
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setAggiungo(false)}
            className="rounded-xl px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
          >
            Annulla
          </button>
        </div>
      )}
    </div>
  )
}
