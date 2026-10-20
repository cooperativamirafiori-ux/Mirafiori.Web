'use client'

/**
 * Documenti d'identità di un prestatore NUOVO, caricati in cima al modulo.
 *
 * I file partono subito verso SharePoint (cartella d'appoggio `_In arrivo`,
 * caricamento diretto a blocchi: i byte non passano da Vercel), poi il server
 * li fa leggere a Claude e il modulo si compila da solo. Al "Salva" il server
 * li sposta in `Documenti Identità` del prestatore.
 *
 * Basta anche un file solo con carta d'identità e codice fiscale. Si possono
 * aggiungere altri file in un secondo momento: la lettura riparte su tutti.
 */

import { useRef, useState } from 'react'
import { MAX_UPLOAD_BYTES, maxUploadMb, inviaFileABlocchi, erroreRisposta } from '@/lib/core/upload-diretto'
import { Banner } from '@/components/ui/Banner'

export interface EsitoLetturaDocumenti {
  dati: {
    nome: string
    cognome: string
    dataNascita: string
    luogoNascita: string
    codiceFiscale: string
    residenza: string
  }
  documenti: { file: string; tipo: string }[]
  avvisi: string[]
}

interface FileCaricato {
  nome: string
  dimensione: number
  stato: 'attesa' | 'caricamento' | 'ok' | 'errore'
  perc: number
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`

const bottoneFile =
  'w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 ' +
  'file:text-sm file:font-semibold file:bg-accent-purple/10 file:text-accent-purple hover:file:bg-accent-purple/20'

export function DocumentiNuovoPrestatore({
  onLotto,
  onLettura,
  disabilitato,
}: {
  /** Lotto su SharePoint e numero di file caricati con successo */
  onLotto: (lotto: string | null, fileCaricati: number) => void
  onLettura: (esito: EsitoLetturaDocumenti) => void
  disabilitato?: boolean
}) {
  const [lotto, setLotto] = useState<string | null>(null)
  const [files, setFiles] = useState<FileCaricato[]>([])
  const [lettura, setLettura] = useState<'ferma' | 'in corso' | 'fatta'>('ferma')
  const [errore, setErrore] = useState<string | null>(null)
  const [riconosciuti, setRiconosciuti] = useState<EsitoLetturaDocumenti['documenti']>([])
  const rif = useRef<HTMLInputElement>(null)

  const occupato = files.some((f) => f.stato === 'caricamento' || f.stato === 'attesa') || lettura === 'in corso'
  const caricati = files.filter((f) => f.stato === 'ok').length

  async function leggi(l: string) {
    setLettura('in corso')
    setErrore(null)
    try {
      const res = await fetch('/api/prestazioni/in-arrivo/leggi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotto: l }),
      })
      if (!res.ok) throw new Error(await erroreRisposta(res, 'Lettura dei documenti non riuscita.'))
      const esito = (await res.json()) as EsitoLetturaDocumenti
      setRiconosciuti(esito.documenti ?? [])
      onLettura(esito)
      setLettura('fatta')
    } catch (e: any) {
      setErrore(`${e?.message ?? 'Lettura non riuscita.'} I documenti sono comunque caricati: puoi compilare a mano.`)
      setLettura('ferma')
    }
  }

  async function aggiungi(lista: FileList | null) {
    const scelti = Array.from(lista ?? [])
    if (rif.current) rif.current.value = ''
    if (!scelti.length) return
    setErrore(null)

    const troppo = scelti.find((f) => f.size > MAX_UPLOAD_BYTES)
    if (troppo) {
      setErrore(`File troppo grande (max ${maxUploadMb()} MB): ${troppo.name}`)
      return
    }

    const base = files.length
    setFiles((prev) => [
      ...prev,
      ...scelti.map((f) => ({ nome: f.name, dimensione: f.size, stato: 'attesa' as const, perc: 0 })),
    ])
    const aggiorna = (i: number, patch: Partial<FileCaricato>) =>
      setFiles((prev) => prev.map((f, j) => (j === base + i ? { ...f, ...patch } : f)))

    let l = lotto
    let ok = caricati
    for (const [i, file] of scelti.entries()) {
      aggiorna(i, { stato: 'caricamento' })
      try {
        const res = await fetch('/api/prestazioni/in-arrivo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lotto: l, filename: file.name, dimensione: file.size }),
        })
        if (!res.ok) throw new Error(await erroreRisposta(res, `Caricamento non riuscito: ${file.name}`))
        const { lotto: nuovo, uploadUrl } = (await res.json()) as { lotto: string; uploadUrl: string }
        l = nuovo
        setLotto(nuovo)
        await inviaFileABlocchi(uploadUrl, file, (p) => aggiorna(i, { perc: p }))
        aggiorna(i, { stato: 'ok', perc: 100 })
        ok++
        onLotto(nuovo, ok)
      } catch (e: any) {
        aggiorna(i, { stato: 'errore' })
        setErrore(e?.message ?? `Caricamento non riuscito: ${file.name}`)
      }
    }

    if (l && ok > 0) await leggi(l)
  }

  return (
    <div className="border-2 border-dashed border-accent-purple/30 rounded-2xl p-4 space-y-3 bg-accent-purple/5">
      <div>
        <p className="text-sm font-semibold text-accent-purple">Prestatore nuovo? Carica i documenti</p>
        <p className="text-xs text-gray-500 mt-1">
          Carta d&apos;identità e codice fiscale: anche un file solo con dentro entrambi, oppure le foto
          fatte col telefono. I dati vengono letti in automatico e compilano il modulo: ricontrollali
          prima di salvare. I documenti si archiviano una volta sola per prestatore.
        </p>
      </div>

      <input
        ref={rif}
        type="file"
        multiple
        accept="image/*,application/pdf"
        disabled={disabilitato || occupato}
        onChange={(e) => aggiungi(e.target.files)}
        className={bottoneFile}
      />

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li key={i} className="bg-white rounded-lg border border-gray-200 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-gray-700 break-all">{f.nome}</span>
                <span
                  className={
                    f.stato === 'ok' ? 'text-emerald-600' : f.stato === 'errore' ? 'text-red-600' : 'text-gray-400'
                  }
                >
                  {f.stato === 'ok'
                    ? `✔ caricato · ${mb(f.dimensione)}`
                    : f.stato === 'errore'
                      ? 'non caricato'
                      : f.stato === 'caricamento'
                        ? `${f.perc}%`
                        : 'in attesa'}
                </span>
              </div>
              {f.stato === 'caricamento' && (
                <div className="mt-1 h-1.5 bg-accent-purple/15 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-purple transition-all" style={{ width: `${f.perc}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {lettura === 'in corso' && (
        <p className="text-sm text-accent-purple font-medium">Lettura dei documenti in corso… (qualche secondo)</p>
      )}

      {lettura === 'fatta' && riconosciuti.length > 0 && (
        <p className="text-xs text-gray-600">
          Riconosciuti: {riconosciuti.map((d) => d.tipo).join(' · ')}
        </p>
      )}

      <Banner tono="errore">{errore}</Banner>

      {lotto && caricati > 0 && !occupato && (
        <button
          type="button"
          onClick={() => leggi(lotto)}
          disabled={disabilitato}
          className="text-sm font-semibold text-accent-purple underline underline-offset-2 disabled:opacity-50"
        >
          Rileggi i documenti
        </button>
      )}
    </div>
  )
}
