'use client'

import { useEffect } from 'react'

/**
 * Pannello sovrapposto: foglio che sale dal basso su telefono, card centrata su
 * desktop. È il pattern già usato in TimbratureOperatore, che è quello giusto —
 * la maggior parte delle persone compila il foglio ore dal telefono.
 *
 * Ci mette anche le tre cose che a scriverle a mano si dimenticano sempre:
 * chiusura con Esc, blocco dello scorrimento dietro, e il clic sullo sfondo che
 * chiude senza che il clic dentro la card lo faccia.
 */
export function Modale({
  titolo,
  sottotitolo,
  onChiudi,
  azioni,
  children,
}: {
  titolo: string
  sottotitolo?: string
  onChiudi: () => void
  /** Pulsanti in fondo, sempre visibili sotto il contenuto. */
  azioni?: React.ReactNode
  children: React.ReactNode
}) {
  useEffect(() => {
    const onTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi()
    }
    document.addEventListener('keydown', onTasto)
    const scorrimento = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onTasto)
      document.body.style.overflow = scorrimento
    }
  }, [onChiudi])

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
      onClick={onChiudi}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-800">{titolo}</h3>
            {sottotitolo && <p className="text-sm text-gray-500 mt-0.5">{sottotitolo}</p>}
          </div>
          <button
            onClick={onChiudi}
            aria-label="Chiudi"
            className="text-2xl leading-none text-gray-400 hover:text-gray-700 px-2 shrink-0"
          >
            ×
          </button>
        </div>

        <div className="mt-4">{children}</div>

        {azioni && <div className="flex gap-2 mt-5">{azioni}</div>}
      </div>
    </div>
  )
}
