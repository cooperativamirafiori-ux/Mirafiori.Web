'use client'

import { useState } from 'react'

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

  async function carica() {
    if (!file) {
      setError('Seleziona un file.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('notula', file)
      const res = await fetch(`/api/notula/${token}`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore durante il caricamento')
      setDone(true)
    } catch (err: any) {
      setError(err?.message ?? 'Errore imprevisto')
    } finally {
      setLoading(false)
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
      {error && <p className="text-xs text-red-600 mt-2">⚠️ {error}</p>}
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
