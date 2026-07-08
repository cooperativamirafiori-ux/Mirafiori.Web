'use client'

import { useEffect, useRef, useState } from 'react'

interface Documento {
  id: string
  nome: string
  url: string
  dimensione?: number
  modificato?: string
}

const CATEGORIE_DOC = [
  'Contratto',
  'Buste paga',
  'Certificazioni',
  'Carta identità',
  'Codice fiscale',
  'Altro',
] as const

function formatKb(bytes?: number): string {
  if (!bytes) return ''
  const kb = bytes / 1024
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`
}

export function CartellaDipendente({ spItemId }: { spItemId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [documenti, setDocumenti] = useState<Documento[]>([])
  const [caricato, setCaricato] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [categoria, setCategoria] = useState<string>(CATEGORIE_DOC[0])
  const fileRef = useRef<HTMLInputElement>(null)

  const base = `/api/risorse-umane/dipendenti/${spItemId}`

  useEffect(() => {
    let attivo = true
    ;(async () => {
      try {
        const res = await fetch(`${base}/cartella`)
        if (!res.ok) throw new Error((await res.json()).error ?? 'Errore')
        const data = await res.json()
        if (!attivo) return
        setUrl(data.url ?? null)
        setDocumenti(data.documenti ?? [])
      } catch (e) {
        if (attivo) setErrore(e instanceof Error ? e.message : 'Errore lettura cartella')
      } finally {
        if (attivo) setCaricato(true)
      }
    })()
    return () => {
      attivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spItemId])

  async function creaCartella() {
    setBusy(true)
    setErrore(null)
    try {
      const res = await fetch(`${base}/cartella`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Errore creazione cartella')
      const data = await res.json()
      setUrl(data.url)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(false)
    }
  }

  async function upload(file: File) {
    setBusy(true)
    setErrore(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (categoria) fd.append('categoria', categoria)
      const res = await fetch(`${base}/documenti`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Errore upload')
      const { documento } = await res.json()
      setDocumenti((prev) => [documento, ...prev.filter((d) => d.id !== documento.id)])
      if (!url) {
        // la cartella è stata creata implicitamente: ricarico l'URL
        try {
          const r = await fetch(`${base}/cartella`)
          if (r.ok) setUrl((await r.json()).url ?? null)
        } catch { /* ignora */ }
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function elimina(doc: Documento) {
    if (!confirm(`Eliminare il documento "${doc.nome}"?`)) return
    setBusy(true)
    setErrore(null)
    try {
      const res = await fetch(`${base}/documenti/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Errore eliminazione')
      setDocumenti((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-emerald-50/60 rounded-2xl border border-emerald-100 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-emerald-700">
          📁 Cartella personale
        </h4>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-emerald-700 hover:underline"
          >
            Apri su SharePoint ↗
          </a>
        )}
      </div>

      {errore && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2 mb-3">
          {errore}
        </div>
      )}

      {!caricato ? (
        <p className="text-sm text-gray-400">Caricamento…</p>
      ) : (
        <>
          {!url && (
            <button
              onClick={creaCartella}
              disabled={busy}
              className="text-sm font-semibold text-emerald-700 border border-emerald-300 bg-white px-3 py-1.5 rounded-xl hover:bg-emerald-100 disabled:opacity-50 mb-3"
            >
              {busy ? 'Creazione…' : 'Crea cartella personale'}
            </button>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
            <label className="text-xs font-semibold text-gray-600">
              Tipo documento
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                disabled={busy}
                className="mt-1 block w-full sm:w-48 border border-emerald-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {CATEGORIE_DOC.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <input
              ref={fileRef}
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) upload(f)
              }}
              disabled={busy}
              className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-white file:text-sm file:font-semibold hover:file:bg-emerald-700 self-end"
            />
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Scegli il tipo, poi il file: verrà salvato nella cartella del dipendente con il tipo come prefisso (es. «Contratto - …»). Max 4 MB per file.
          </p>

          {documenti.length === 0 ? (
            <p className="text-sm text-gray-400">Nessun documento caricato.</p>
          ) : (
            <ul className="divide-y divide-emerald-100 bg-white rounded-xl border border-emerald-100 overflow-hidden">
              {documenti.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-800 hover:text-emerald-700 hover:underline truncate"
                  >
                    {d.nome}
                  </a>
                  <div className="flex items-center gap-3 shrink-0">
                    {d.dimensione ? <span className="text-xs text-gray-400">{formatKb(d.dimensione)}</span> : null}
                    <button
                      onClick={() => elimina(d)}
                      disabled={busy}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      Elimina
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
