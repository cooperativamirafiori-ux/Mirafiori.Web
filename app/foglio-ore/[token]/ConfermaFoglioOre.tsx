'use client'

import { useState } from 'react'

interface Riga {
  data: string
  servizio: string
  orario: string
  ore: number
  perConto: boolean
}

interface Props {
  token: string
  esitoIniziale: 'conferma' | 'errore'
  nominativo: string
  periodo: string
  validatoDa: string
  giaContestato: boolean
  oreLavorate: number
  oreGiustificativo: number
  oreAttese: number
  giustificativi: { servizioId: number; nome: string; ore: number }[]
  righe: Riga[]
}

const ore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')).replace('.', ',')
const gg = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`

export function ConfermaFoglioOre(props: Props) {
  const [esito, setEsito] = useState<'conferma' | 'errore'>(props.esitoIniziale)
  const [note, setNote] = useState('')
  const [dettaglio, setDettaglio] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [fatto, setFatto] = useState<'conferma' | 'errore' | null>(null)

  const scost = Math.round((props.oreLavorate + props.oreGiustificativo - props.oreAttese) * 100) / 100

  async function invia() {
    if (esito === 'errore' && !note.trim()) {
      setErrore('Scrivi che cosa non torna: serve al responsabile per correggere.')
      return
    }
    setBusy(true)
    setErrore(null)
    try {
      const res = await fetch(`/api/foglio-ore/${props.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esito, note: note.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Non è stato possibile registrare la risposta')
      setFatto(esito)
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (fatto) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 text-center">
        <p className="text-4xl mb-3">{fatto === 'conferma' ? '✅' : '✋'}</p>
        <p className="font-semibold text-gray-800">
          {fatto === 'conferma' ? 'Grazie, registrato' : 'Segnalazione inviata'}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          {fatto === 'conferma'
            ? `Il tuo foglio ore di ${props.periodo} è confermato e archiviato nella tua cartella personale.`
            : 'Il tuo responsabile è stato avvisato: correggerà il foglio e te lo rimanderà da confermare.'}
        </p>
        <p className="text-xs text-gray-400 mt-4">Puoi chiudere questa pagina.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
      <div>
        <p className="text-xs text-gray-400">{props.nominativo}</p>
        <h1 className="text-lg font-bold text-gray-800 mt-0.5 capitalize">Foglio ore di {props.periodo}</h1>
        {props.validatoDa && (
          <p className="text-xs text-gray-500 mt-1">Validato da {props.validatoDa}</p>
        )}
      </div>

      {props.giaContestato && (
        <div className="bg-orange-50 border border-orange-200 text-orange-800 text-sm rounded-xl px-4 py-3">
          Hai già segnalato un errore su questo foglio: è in attesa di correzione.
        </div>
      )}

      <dl className="text-sm bg-gray-50 rounded-xl px-4 py-3 space-y-1">
        <Voce label="Ore lavorate" valore={`${ore(props.oreLavorate)} h`} forte />
        <Voce label="Ferie, permessi e altre voci" valore={`${ore(props.oreGiustificativo)} h`} />
        <Voce label="Ore previste dal contratto" valore={`${ore(props.oreAttese)} h`} />
        <Voce
          label="Differenza"
          valore={`${scost >= 0 ? '+' : ''}${ore(scost)} h`}
          colore={scost < 0 ? 'text-red-600' : 'text-emerald-600'}
          forte
        />
      </dl>

      {props.giustificativi.length > 0 && (
        <div className="text-sm space-y-1">
          {props.giustificativi.map((v) => (
            <div key={v.servizioId} className="flex justify-between">
              <span className="text-accent-purple">{v.nome}</span>
              <span className="text-gray-500 font-semibold">{ore(v.ore)} h</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setDettaglio((d) => !d)}
        className="text-sm font-semibold text-brand-cyan-dark"
      >
        {dettaglio ? 'Nascondi il dettaglio ▲' : `Vedi tutte le righe (${props.righe.length}) ▼`}
      </button>

      {dettaglio && (
        <div className="max-h-72 overflow-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
          {props.righe.map((r, i) => (
            <div key={i} className="flex justify-between gap-2 px-3 py-2 text-xs">
              <span className="text-gray-700">
                <strong className="font-semibold">{gg(r.data)}</strong> {r.servizio}
                {r.perConto && (
                  <span className="ml-1 text-[10px] font-semibold px-1 py-0.5 rounded bg-amber-100 text-amber-700">
                    inserita dal responsabile
                  </span>
                )}
              </span>
              <span className="text-gray-400 whitespace-nowrap">
                {r.orario ? `${r.orario} · ` : ''}
                {ore(r.ore)} h
              </span>
            </div>
          ))}
          {props.righe.length === 0 && (
            <div className="px-3 py-4 text-xs text-gray-400 text-center">Nessuna riga registrata.</div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Opzione
          attiva={esito === 'conferma'}
          onClick={() => setEsito('conferma')}
          emoji="✅"
          testo="Confermo, è corretto"
          stileAttivo="bg-emerald-600 text-white border-emerald-600"
        />
        <Opzione
          attiva={esito === 'errore'}
          onClick={() => setEsito('errore')}
          emoji="✋"
          testo="C’è un errore"
          stileAttivo="bg-orange-500 text-white border-orange-500"
        />
      </div>

      {esito === 'errore' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Che cosa non torna? <span className="text-gray-400 font-normal">— aiuta a correggere</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-brand-orange"
            placeholder="Es. il 12 ho lavorato 6 ore, non 4"
          />
        </div>
      )}

      {errore && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{errore}</div>}

      <button
        onClick={invia}
        disabled={busy}
        className="w-full bg-brand-cyan-dark text-white py-3 rounded-xl font-semibold disabled:opacity-50"
      >
        {busy ? 'Registro…' : esito === 'conferma' ? 'Conferma il foglio ore' : 'Invia la segnalazione'}
      </button>
      <p className="text-xs text-gray-400 text-center">
        {esito === 'conferma'
          ? 'Il PDF definitivo verrà archiviato nella tua cartella personale.'
          : 'Il foglio torna al tuo responsabile, che lo corregge e te lo rimanda.'}
      </p>
    </div>
  )
}

function Voce({ label, valore, forte, colore }: { label: string; valore: string; forte?: boolean; colore?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className={`text-right ${forte ? 'font-semibold' : ''} ${colore ?? 'text-gray-800'}`}>{valore}</dd>
    </div>
  )
}

function Opzione({
  attiva,
  onClick,
  emoji,
  testo,
  stileAttivo,
}: {
  attiva: boolean
  onClick: () => void
  emoji: string
  testo: string
  stileAttivo: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 border rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
        attiva ? stileAttivo : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
      }`}
    >
      <span className="text-lg">{emoji}</span>
      <span>{testo}</span>
      {attiva && <span className="ml-auto text-xs font-normal opacity-80">selezionato</span>}
    </button>
  )
}
