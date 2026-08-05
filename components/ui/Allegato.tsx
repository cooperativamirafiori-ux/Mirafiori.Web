'use client'

import { useEffect, useRef } from 'react'
import { MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/core/upload-diretto'

/**
 * Campo per scegliere un file da allegare.
 *
 * Sta fuori da `Campo` perché non lega una stringa ma un `File | null`, e perché
 * ha un limite di dimensione da controllare. Il limite è quello di
 * `core/upload-diretto`, così esiste in un posto solo: quando cambia, cambia qui.
 *
 * Mostra il file scelto con la sua dimensione — senza, l'unico modo di sapere se
 * la scelta è andata a segno è il nome minuscolo che mette il browser — e avvisa
 * subito se è troppo grande, invece di far scoprire il problema al salvataggio.
 */

const bottone =
  'w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 ' +
  'file:text-sm file:font-semibold file:bg-accent-purple/10 file:text-accent-purple hover:file:bg-accent-purple/20'

const mb = (byte: number) => `${(byte / 1024 / 1024).toFixed(1)} MB`

export function Allegato({
  etichetta,
  file,
  onChange,
  obbligatorio,
  aiuto,
  accetta = 'image/*,application/pdf',
  disabilitato,
}: {
  etichetta: string
  file: File | null
  onChange: (f: File | null) => void
  obbligatorio?: boolean
  aiuto?: string
  /** Filtro del selettore di file. Default: immagini e PDF. */
  accetta?: string
  disabilitato?: boolean
}) {
  const troppoGrande = !!file && file.size > MAX_UPLOAD_BYTES
  const rif = useRef<HTMLInputElement>(null)

  // React non svuota un input file: dopo un salvataggio riuscito il codice mette
  // lo stato a null, ma il browser continua a mostrare il nome del file scelto
  // prima. Rimasti così, i due si contraddicono. Allineiamo il campo allo stato,
  // ma solo nel verso dello svuotamento: nell'altro è il browser a comandare.
  useEffect(() => {
    if (!file && rif.current?.value) rif.current.value = ''
  }, [file])

  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">
        {etichetta}
        {obbligatorio && <span className="text-red-500 ml-0.5">*</span>}
      </span>

      <input
        ref={rif}
        type="file"
        accept={accetta}
        disabled={disabilitato}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className={bottone}
      />

      {troppoGrande ? (
        <span className="block text-xs text-red-600 mt-1">
          Troppo grande ({mb(file.size)}): il massimo è {maxUploadMb()} MB.
        </span>
      ) : file ? (
        <span className="block text-xs text-gray-500 mt-1">
          {file.name} · {mb(file.size)}
        </span>
      ) : aiuto ? (
        <span className="block text-xs text-gray-400 mt-1">{aiuto}</span>
      ) : null}
    </label>
  )
}
