'use client'

/**
 * La mascherina delle uscite senza fattura.
 *
 * Serve a chi tiene la cassa (Claudia) per mettere in coda i costi con
 * scadenza che non passano dallo SDI — F24, tributi, contributi, rate,
 * ricariche delle carte — nel momento in cui ne conosce l'importo.
 *
 * Le scelte di interfaccia che vale la pena non disfare:
 *
 *  - **Quattro campi, non dieci.** Cosa, quando, quanto, e se è un costo.
 *    Il centro di costo non si chiede qui: si attribuisce dopo, insieme alle
 *    fatture, perché la previsione di cassa e il controllo di gestione hanno
 *    tempi diversi e chiederlo adesso fermerebbe l'inserimento.
 *  - **Chiusa di default.** È un pannello che si apre, non un modulo sempre
 *    aperto in cima alla pagina: nove volte su dieci si viene qui per pagare,
 *    non per inserire.
 *  - **Resta aperta dopo il salvataggio**, con la data conservata e gli altri
 *    campi vuoti. Le uscite si inseriscono a gruppetti, quando arriva il
 *    momento di guardarle: richiuderla costringerebbe a riaprirla ogni volta.
 *  - **Il doppione si avvisa, non si blocca.** Due rate uguali nello stesso
 *    mese esistono. Ma inserire due volte lo stesso F24 è l'errore più
 *    probabile qui, e a differenza di una fattura non c'è un protocollo che lo
 *    impedisca: quindi l'API risponde 409 e si chiede conferma una volta.
 */

import { useState } from 'react'
import { Campo } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import { NATURE, type NaturaUscita } from '@/types/pagamenti'

const oggiISO = () => new Date().toISOString().slice(0, 10)

const dataIt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT')

const euro = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

interface Simile {
  id: string
  oggetto: string
  dataScadenza: string
}

export function NuovaUscita({ onFatto }: { onFatto: () => void }) {
  const [aperta, setAperta] = useState(false)
  const [oggetto, setOggetto] = useState('')
  const [data, setData] = useState(oggiISO())
  const [importo, setImporto] = useState('')
  const [natura, setNatura] = useState<NaturaUscita>('costo')
  const [note, setNote] = useState('')

  const [errore, setErrore] = useState('')
  const [campoInErrore, setCampoInErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [simile, setSimile] = useState<Simile | null>(null)
  const [inCorso, setInCorso] = useState(false)

  function pulisci() {
    // La data resta: si inseriscono più uscite con la stessa scadenza.
    setOggetto('')
    setImporto('')
    setNote('')
    setNatura('costo')
    setSimile(null)
    setCampoInErrore('')
  }

  async function salva(confermaDoppione = false) {
    setInCorso(true)
    setErrore('')
    setMessaggio('')
    setCampoInErrore('')
    try {
      const res = await fetch('/api/pagamenti/uscite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oggetto,
          dataScadenza: data,
          importo: Number(importo.replace(',', '.')),
          natura,
          note,
          confermaDoppione,
        }),
      })
      const j = await res.json()

      if (res.status === 409 && j.richiedeConferma) {
        setSimile(j.simile as Simile)
        return
      }
      if (!res.ok) {
        setErrore(j.error ?? 'Inserimento non riuscito')
        setCampoInErrore(typeof j.campo === 'string' ? j.campo : '')
        return
      }

      setMessaggio(`«${oggetto}» in coda da pagare, scade il ${dataIt(data)}`)
      pulisci()
      onFatto()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Inserimento non riuscito')
    } finally {
      setInCorso(false)
    }
  }

  if (!aperta) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3">
        <p className="text-sm text-gray-500">
          Un costo con scadenza che non arriva da una fattura? F24, tributi, contributi, rate.
        </p>
        <button
          onClick={() => setAperta(true)}
          className="shrink-0 rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white"
        >
          Aggiungi un’uscita
        </button>
      </div>
    )
  }

  const numero = Number(importo.replace(',', '.'))
  const anteprima = Number.isFinite(numero) && numero > 0 ? euro(numero) : null

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-800">Nuova uscita senza fattura</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Finisce nella coda «da pagare» insieme alle fatture, e nei totali a 30 e 60 giorni.
          </p>
        </div>
        <button
          onClick={() => {
            setAperta(false)
            pulisci()
            setErrore('')
            setMessaggio('')
          }}
          className="shrink-0 text-sm text-gray-500 underline underline-offset-2"
        >
          Chiudi
        </button>
      </div>

      <Banner tono="errore">{simile ? '' : errore}</Banner>
      <Banner tono="ok">{messaggio}</Banner>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Campo
            etichetta="Cosa si paga"
            valore={oggetto}
            onChange={setOggetto}
            obbligatorio
            segnaposto="F24 agosto, rata INPS, contributo Confcooperative…"
            maxLength={200}
            errore={campoInErrore === 'oggetto' ? errore : undefined}
          />
        </div>

        <Campo
          etichetta="Scade il"
          valore={data}
          onChange={setData}
          tipo="date"
          obbligatorio
          errore={campoInErrore === 'dataScadenza' ? errore : undefined}
        />

        <Campo
          etichetta="Importo"
          valore={importo}
          onChange={setImporto}
          tipo="currency"
          obbligatorio
          min={0}
          aiuto={anteprima ?? undefined}
          errore={campoInErrore === 'importo' ? errore : undefined}
        />

        <div className="sm:col-span-2">
          <Campo
            etichetta="È un costo o solo un movimento di cassa?"
            valore={natura}
            onChange={(v) => setNatura(v as NaturaUscita)}
            tipo="choice"
            scelte={NATURE.map((n) => ({ valore: n.valore, etichetta: n.etichetta }))}
            senzaVuoto
            obbligatorio
            aiuto={NATURE.find((n) => n.valore === natura)?.aiuto}
            errore={campoInErrore === 'natura' ? errore : undefined}
          />
        </div>

        <div className="sm:col-span-2">
          <Campo
            etichetta="Note"
            valore={note}
            onChange={setNote}
            tipo="textarea"
            righe={2}
            segnaposto="Facoltativo: a cosa si riferisce, quale rata, dove trovare il documento"
          />
        </div>
      </div>

      {/* Il doppione: si mostra la riga che somiglia e si chiede una volta.
          Il tasto di conferma dice cosa fa, non «OK». */}
      {simile && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 space-y-2">
          <p className="text-sm text-amber-900">
            C’è già <strong>«{simile.oggetto}»</strong> di pari importo, con scadenza il{' '}
            {dataIt(simile.dataScadenza)}. Forse l’hai già inserita.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void salva(true)}
              disabled={inCorso}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Sono due uscite diverse, inseriscila
            </button>
            <button
              onClick={() => setSimile(null)}
              className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900"
            >
              Lascia perdere
            </button>
          </div>
        </div>
      )}

      {!simile && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void salva()}
            disabled={inCorso || oggetto.trim().length < 3 || !importo}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {inCorso ? 'Salvataggio…' : 'Metti in coda da pagare'}
          </button>
          <span className="text-xs text-gray-400">
            Non passa dall’approvazione: chi la inserisce l’ha già decisa.
          </span>
        </div>
      )}
    </div>
  )
}
