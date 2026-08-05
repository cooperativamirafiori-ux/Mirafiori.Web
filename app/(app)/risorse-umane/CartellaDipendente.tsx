'use client'

import { messaggioErrore } from '@/lib/risorse-umane/fetch'
import { inviaFileABlocchi, MAX_UPLOAD_BYTES } from '@/lib/core/upload-diretto'
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

/** Tetto lato client, allineato a quello della route (vedi lib/upload-diretto). */
const MAX_BYTES = MAX_UPLOAD_BYTES

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
  const [avanzamento, setAvanzamento] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const base = `/api/risorse-umane/dipendenti/${spItemId}`

  useEffect(() => {
    let attivo = true
    ;(async () => {
      try {
        const res = await fetch(`${base}/cartella`)
        if (!res.ok) throw new Error(await messaggioErrore(res, 'Errore lettura cartella'))
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
      if (!res.ok) throw new Error(await messaggioErrore(res, 'Errore creazione cartella'))
      const data = await res.json()
      setUrl(data.url)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Carica il file DIRETTAMENTE su SharePoint, a blocchi.
   *
   * Il nostro server non vede mai i byte: si limita ad aprire la sessione e a
   * restituire un URL pre-autorizzato. Prima il file passava dalla memoria di
   * una funzione serverless, con il limite dei 4 MB che ne derivava.
   *
   * ⚠️ Sull'URL della sessione NON va inviato nessun header Authorization: è già
   * autorizzato, e aggiungerne uno fa rifiutare la richiesta.
   */
  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      setErrore(`File troppo grande (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setBusy(true)
    setErrore(null)
    setAvanzamento(0)
    try {
      // 1. sessione: unica richiesta che passa dal nostro server
      const resSessione = await fetch(`${base}/documenti`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, categoria, dimensione: file.size }),
      })
      if (!resSessione.ok) {
        throw new Error(await messaggioErrore(resSessione, 'Errore apertura caricamento'))
      }
      const { uploadUrl, nomeFile } = (await resSessione.json()) as {
        uploadUrl: string
        nomeFile: string
      }

      // 2. blocchi verso SharePoint (helper condiviso con prestazioni e software)
      await inviaFileABlocchi(uploadUrl, file, setAvanzamento)

      // 3. conferma: registra l'azione nel log e rinfresca l'elenco
      const resConferma = await fetch(`${base}/documenti/conferma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeFile }),
      })
      if (resConferma.ok) {
        const dati = await resConferma.json()
        if (Array.isArray(dati.documenti)) setDocumenti(dati.documenti)
        if (dati.url) setUrl(dati.url)
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(false)
      setAvanzamento(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function elimina(doc: Documento) {
    if (!confirm(`Eliminare il documento "${doc.nome}"?`)) return
    setBusy(true)
    setErrore(null)
    try {
      const res = await fetch(`${base}/documenti/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await messaggioErrore(res, 'Errore eliminazione'))
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
          {avanzamento !== null && (
            <div className="mb-3">
              <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-200"
                  style={{ width: `${avanzamento}%` }}
                />
              </div>
              <p className="text-xs text-emerald-700 mt-1">Caricamento {avanzamento}%</p>
            </div>
          )}

          <p className="text-xs text-gray-400 mb-3">
            Scegli il tipo, poi il file: verrà salvato nella cartella del dipendente con il tipo come prefisso (es. «Contratto - …»). Max 50 MB per file.
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
