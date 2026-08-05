'use client'

import { useState } from 'react'
import { caricaDirettamente, MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/core/upload-diretto'

export function NotulaUploadForm({
  token,
  giaCaricata,
}: {
  token: string
  giaCaricata: boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(giaCaricata)
  const [error, setError] = useState<string | null>(null)
  const [avanzamento, setAvanzamento] = useState<number | null>(null)

  /**
   * Caricamento DIRETTO su SharePoint: il file non passa dal nostro server, che
   * si limita ad aprire la sessione (validando il token) e a registrare l'esito.
   */
  async function carica() {
    if (!file) {
      setError('Seleziona un file.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File troppo grande (max ${maxUploadMb()} MB).`)
      return
    }
    setLoading(true)
    setError(null)
    setAvanzamento(0)
    try {
      await caricaDirettamente({
        file,
        urlSessione: `/api/notula/${token}/sessione`,
        urlConferma: `/api/notula/${token}/conferma`,
        onAvanzamento: setAvanzamento,
      })
      setDone(true)
    } catch (err: any) {
      setError(err?.message ?? 'Errore imprevisto')
    } finally {
      setLoading(false)
      setAvanzamento(null)
    }
  }

  if (done) {
    return (
      <div className="mt-5 bg-green-50 text-green-700 text-sm p-4 rounded-lg text-center">
        ✅ Notula caricata correttamente. Grazie! Puoi chiudere questa pagina.
      </div>
    )
  }

  return (
    <div className="mt-5">
      <input
        type="file"
        accept="application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
      />
      <p className="text-xs text-gray-400 mt-2">
        PDF, immagine o Word — fino a {maxUploadMb()} MB.
      </p>
      {error && <p className="text-xs text-red-600 mt-2">⚠️ {error}</p>}
      {avanzamento !== null && (
        <div className="mt-3">
          <div className="h-2 bg-primary/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${avanzamento}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 text-center">{avanzamento}%</p>
        </div>
      )}
      <button
        onClick={carica}
        disabled={loading || !file}
        className="mt-4 w-full bg-primary text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? 'Caricamento…' : 'Carica notula'}
      </button>
    </div>
  )
}
