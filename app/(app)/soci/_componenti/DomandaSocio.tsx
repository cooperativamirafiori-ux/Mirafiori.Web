'use client'

import { useState } from 'react'
import { Allegato } from '@/components/ui/Allegato'
import { Banner } from '@/components/ui/Banner'
import { Campo } from '@/components/ui/Campo'
import { caricaDirettamente, erroreRisposta } from '@/lib/core/upload-diretto'
import {
  IMPORTO_QUOTA,
  MODALITA_VERSAMENTO,
  NUMERO_QUOTE,
  TIPI_SOCIO,
  totaleQuote,
  validaDati,
  type DatiDomanda,
  type Domanda,
} from '@/types/soci'

/**
 * Domanda di ammissione socio, in tre passi:
 *   1. i dati (già compilati dalla scheda del personale) → Salva
 *   2. scarica il PDF, firmalo, caricalo
 *   3. fatto: numero dell'Elenco Generale
 *
 * Misura grande dei campi, come Richiesta Fattura: la usa chiunque venga
 * assunto, anche dal telefono.
 */

type Passo = 'dati' | 'firma' | 'fatto'
type Errori = Partial<Record<keyof DatiDomanda, string>>

const euro = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function DomandaSocio({
  iniziali,
  domanda: domandaIniziale,
  giaSocio = null,
}: {
  iniziali: DatiDomanda
  domanda: Domanda | null
  /** Chi è già socio vede tutto ma non può inviare la firmata (30/10/2026). */
  giaSocio?: { numero: number | null } | null
}) {
  const [dati, setDati] = useState<DatiDomanda>(iniziali)
  const [domanda, setDomanda] = useState<Domanda | null>(domandaIniziale)
  const [passo, setPasso] = useState<Passo>(domandaIniziale ? 'firma' : 'dati')
  const [errori, setErrori] = useState<Errori>({})
  const [errore, setErrore] = useState('')
  const [occupato, setOccupato] = useState<'' | 'salva' | 'pdf' | 'carica' | 'registra'>('')
  const [file, setFile] = useState<File | null>(null)
  const [avanzamento, setAvanzamento] = useState<number | null>(null)
  const [numero, setNumero] = useState<number | null>(null)
  const [daRiprovare, setDaRiprovare] = useState(domandaIniziale?.stato === 'Firmata')

  const firmata = domanda?.stato === 'Firmata' || daRiprovare
  const campo = (k: keyof DatiDomanda) => ({
    valore: dati[k],
    onChange: (v: string) => {
      setDati((d) => ({ ...d, [k]: v }))
      if (errori[k]) setErrori((e) => ({ ...e, [k]: undefined }))
    },
    errore: errori[k],
    grande: true,
    obbligatorio: true,
  })

  async function salva() {
    setErrore('')
    const e = validaDati(dati)
    setErrori(e)
    if (Object.keys(e).length) {
      setErrore('Controlla i campi segnati in rosso.')
      return
    }
    setOccupato('salva')
    try {
      const res = await fetch('/api/soci/domanda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dati }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (j.errori) setErrori(j.errori)
        throw new Error(j.error || 'Salvataggio non riuscito')
      }
      setDomanda(j.domanda)
      setPasso('firma')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      setErrore(err.message)
    } finally {
      setOccupato('')
    }
  }

  async function scaricaPdf() {
    if (!domanda) return
    setErrore('')
    setOccupato('pdf')
    try {
      const res = await fetch(`/api/soci/domanda/${domanda.spItemId}/pdf`)
      if (!res.ok) throw new Error(await erroreRisposta(res, 'PDF non disponibile'))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Domanda ammissione socio - ${dati.cognome} ${dati.nome}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err: any) {
      setErrore(err.message)
    } finally {
      setOccupato('')
    }
  }

  async function carica() {
    if (!domanda || !file) return
    setErrore('')
    setOccupato('carica')
    setAvanzamento(0)
    try {
      const esito = await caricaDirettamente<{ numero: number }>({
        file,
        urlSessione: `/api/soci/domanda/${domanda.spItemId}/firmata`,
        urlConferma: `/api/soci/domanda/${domanda.spItemId}/firmata`,
        metodoConferma: 'PUT',
        onAvanzamento: setAvanzamento,
      })
      setNumero(esito.numero)
      setFile(null)
      setPasso('fatto')
    } catch (err: any) {
      // La conferma risponde 500 "firmata" quando il file è arrivato ma la
      // registrazione no: da lì si riprova senza ricaricare.
      if (/registrazione non si è completata/.test(err.message)) setDaRiprovare(true)
      setErrore(err.message)
    } finally {
      setOccupato('')
      setAvanzamento(null)
    }
  }

  async function riprova() {
    if (!domanda) return
    setErrore('')
    setOccupato('registra')
    try {
      const res = await fetch(`/api/soci/domanda/${domanda.spItemId}/registra`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Registrazione non riuscita')
      setNumero(j.numero)
      setPasso('fatto')
    } catch (err: any) {
      setErrore(err.message)
    } finally {
      setOccupato('')
    }
  }

  // ------------------------------------------------------------------
  if (passo === 'fatto') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3 text-center">
        <div className="text-5xl">🎉</div>
        <h2 className="text-xl font-bold text-gray-800">Domanda registrata</h2>
        {numero != null && (
          <p className="text-gray-700">
            Il tuo numero nell’Elenco Generale dei soci è <strong className="text-2xl">{numero}</strong>.
          </p>
        )}
        <p className="text-sm text-gray-500">
          Le Risorse Umane hanno ricevuto la tua domanda. L’ammissione diventa definitiva con la delibera del
          Consiglio di Amministrazione.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {giaSocio && <AvvisoGiaSocio numero={giaSocio.numero} />}
      <Indicatore passo={passo} />
      <Banner tono="errore">{errore}</Banner>

      {passo === 'dati' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Abbiamo già scritto i dati che troviamo nella tua scheda del personale. <strong>Controllali</strong> e
            completa quelli che mancano.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <Campo etichetta="Cognome" maiuscolo {...campo('cognome')} />
            <Campo etichetta="Nome" maiuscolo {...campo('nome')} />
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Campo etichetta="Nato/a a" {...campo('luogoNascita')} />
            <Campo etichetta="Prov." maiuscolo maxLength={2} segnaposto="TO" {...campo('provNascita')} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo etichetta="Data di nascita" tipo="date" {...campo('dataNascita')} />
            <Campo etichetta="Cittadinanza" segnaposto="Italiana" {...campo('cittadinanza')} />
          </div>
          <Campo etichetta="Codice fiscale" maiuscolo maxLength={16} {...campo('codiceFiscale')} />
          <Campo etichetta="Professione" segnaposto="Es. educatrice" {...campo('professione')} />
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Campo etichetta="Residente a (comune)" {...campo('comuneResidenza')} />
            <Campo etichetta="Prov." maiuscolo maxLength={2} segnaposto="TO" {...campo('provResidenza')} />
          </div>
          <Campo etichetta="Via e numero civico" {...campo('indirizzo')} />
          <Campo etichetta="Telefono" tipo="tel" inputMode="tel" {...campo('telefono')} />

          <Scelte
            titolo="Chiedo di essere ammesso/a come"
            valore={dati.tipoSocio}
            errore={errori.tipoSocio}
            opzioni={TIPI_SOCIO.map((t) => ({ valore: t.valore, etichetta: t.etichetta }))}
            onChange={(v) => {
              setDati((d) => ({ ...d, tipoSocio: v as DatiDomanda['tipoSocio'] }))
              setErrori((e) => ({ ...e, tipoSocio: undefined }))
            }}
          />

          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700">
            Mi impegno a sottoscrivere e versare <strong>{NUMERO_QUOTE} quote mensili</strong> da{' '}
            <strong>{euro(IMPORTO_QUOTA)} €</strong>, per un totale di <strong>{euro(totaleQuote())} €</strong>.
          </div>

          <Scelte
            titolo="Come vuoi versare le quote"
            valore={dati.modalita}
            errore={errori.modalita}
            opzioni={MODALITA_VERSAMENTO.map((m) => ({ valore: m.valore, etichetta: m.etichetta }))}
            onChange={(v) => {
              setDati((d) => ({ ...d, modalita: v as DatiDomanda['modalita'] }))
              setErrori((e) => ({ ...e, modalita: undefined }))
            }}
          />

          <button
            type="button"
            onClick={salva}
            disabled={!!occupato}
            className="w-full rounded-xl bg-brand-cyan text-white font-bold text-base py-3.5 disabled:opacity-60"
          >
            {occupato === 'salva' ? 'Salvataggio…' : 'Salva e vai avanti'}
          </button>
        </div>
      )}

      {passo === 'firma' && domanda && (
        <div className="space-y-4">
          {!firmata && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
              <h2 className="font-bold text-gray-800">1. Scarica e stampa la domanda</h2>
              <p className="text-sm text-gray-600">
                È il modulo della cooperativa, già compilato con i tuoi dati. Stampalo e <strong>firmalo</strong> in
                fondo, dove c’è scritto “In fede”.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={scaricaPdf}
                  disabled={!!occupato}
                  className="rounded-xl bg-brand-cyan text-white font-bold px-5 py-3 disabled:opacity-60"
                >
                  {occupato === 'pdf' ? 'Preparo il PDF…' : '⬇ Scarica il PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => setPasso('dati')}
                  disabled={!!occupato}
                  className="rounded-xl border border-gray-300 text-gray-700 font-semibold px-5 py-3"
                >
                  Correggi i dati
                </button>
              </div>
            </div>
          )}

          {!firmata ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
              <h2 className="font-bold text-gray-800">2. Carica la domanda firmata</h2>
              <p className="text-sm text-gray-600">
                Scansionala, oppure fai una foto ben leggibile con il telefono.
              </p>
              <Allegato
                etichetta="Domanda firmata"
                file={file}
                onChange={setFile}
                accetta="application/pdf,image/jpeg,image/png,image/heic"
                disabilitato={!!occupato || !!giaSocio}
              />
              {avanzamento != null && (
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-brand-cyan transition-all" style={{ width: `${avanzamento}%` }} />
                </div>
              )}
              {giaSocio && (
                <p className="text-sm font-semibold text-amber-800">
                  Sei già socio/a: l’invio della domanda è bloccato.
                </p>
              )}
              <button
                type="button"
                onClick={carica}
                disabled={!file || !!occupato || !!giaSocio}
                className="w-full rounded-xl bg-emerald-600 text-white font-bold text-base py-3.5 disabled:opacity-50"
              >
                {occupato === 'carica' ? 'Invio in corso…' : 'Invia la domanda firmata'}
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
              <h2 className="font-bold text-gray-800">La domanda firmata è arrivata</h2>
              <p className="text-sm text-gray-600">
                Manca solo l’ultimo passaggio, che si era interrotto. Premi il bottone per completarlo.
              </p>
              <button
                type="button"
                onClick={riprova}
                disabled={!!occupato}
                className="w-full rounded-xl bg-emerald-600 text-white font-bold text-base py-3.5 disabled:opacity-50"
              >
                {occupato === 'registra' ? 'Completo…' : 'Completa la registrazione'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Grande e in cima: chi è già socio deve accorgersene prima di compilare. */
function AvvisoGiaSocio({ numero }: { numero: number | null }) {
  return (
    <div role="status" className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 flex gap-4 items-start">
      <div className="text-4xl leading-none" aria-hidden>
        ⚠️
      </div>
      <div>
        <p className="text-lg font-bold text-amber-900">Sei già socio/a della cooperativa</p>
        {numero != null && (
          <p className="text-amber-900">
            Il tuo numero nell’Elenco Generale è <strong>{numero}</strong>.
          </p>
        )}
        <p className="text-sm text-amber-800 mt-1">
          Puoi vedere la domanda e scaricare il modulo, ma non inviarla di nuovo. Se pensi sia un errore scrivi a{' '}
          <a className="underline" href="mailto:risorseumane@cooperativamirafiori.com">risorseumane@cooperativamirafiori.com</a>.
        </p>
      </div>
    </div>
  )
}

function Indicatore({ passo }: { passo: Passo }) {
  const passi: [Passo, string][] = [
    ['dati', 'I tuoi dati'],
    ['firma', 'Firma e invia'],
  ]
  return (
    <ol className="flex gap-2 text-xs font-semibold">
      {passi.map(([k, t], i) => (
        <li
          key={k}
          className={`flex-1 rounded-full px-3 py-1.5 text-center ${
            k === passo ? 'bg-brand-cyan text-white' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {i + 1}. {t}
        </li>
      ))}
    </ol>
  )
}

/** Gruppo di scelte a bottoni grandi: più facile da toccare di un menu a tendina. */
function Scelte({
  titolo,
  valore,
  opzioni,
  onChange,
  errore,
}: {
  titolo: string
  valore: string
  opzioni: { valore: string; etichetta: string }[]
  onChange: (v: string) => void
  errore?: string
}) {
  return (
    <fieldset>
      <legend className="block text-sm font-semibold text-gray-700 mb-1.5">
        {titolo}
        <span className="text-red-500 ml-0.5">*</span>
      </legend>
      <div className="space-y-2">
        {opzioni.map((o) => (
          <label
            key={o.valore}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer ${
              valore === o.valore ? 'border-brand-cyan bg-brand-cyan/10' : errore ? 'border-red-300' : 'border-gray-300'
            }`}
          >
            <input
              type="radio"
              checked={valore === o.valore}
              onChange={() => onChange(o.valore)}
              className="h-5 w-5 accent-[#00728F]"
            />
            <span className="text-base text-gray-800">{o.etichetta}</span>
          </label>
        ))}
      </div>
      {errore && <p className="text-sm text-red-600 mt-1">{errore}</p>}
    </fieldset>
  )
}
