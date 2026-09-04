'use client'

/**
 * Variazioni dell'orario contrattuale di un dipendente: storico e registrazione.
 *
 * Estratto dal cruscotto perché è un pannello autonomo — ha stato suo, due
 * chiamate sue e nessun legame col resto della schermata — e perché il cruscotto
 * era arrivato a superare le 500 righe.
 *
 * Perché è un registro e non un campo: il monte ore settimanale determina le ore
 * attese di ogni giornata, e quindi la completezza, i solleciti, lo scostamento e
 * la flessibilità. Una variazione registrata con la decorrenza sbagliata riscrive
 * in silenzio le ore attese dei mesi passati, e senza storico nessuno se ne
 * accorge. Per lo stesso motivo si può cancellare: salvare la decorrenza giusta
 * non fa sparire quella sbagliata, che continua a valere per il periodo in cui è
 * la più recente.
 */

import { useEffect, useState } from 'react'
import { Allegato } from '@/components/ui/Allegato'
import { caricaDirettamente } from '@/lib/core/upload-diretto'
import type { FasciaProfilo, ProfiloOrario, Servizio } from '@/types/timbrature'
import { OrarioTeorico, oreFascia } from './OrarioTeorico'

const GG = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const oreFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))
const gg = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`

const ORE_PROFILO = (p: ProfiloOrario) => [p.oreLun, p.oreMar, p.oreMer, p.oreGio, p.oreVen, p.oreSab, p.oreDom]

/** Ore di un giorno secondo l'orario teorico che si sta componendo. */
const oreDelGiorno = (fasce: FasciaProfilo[], giorno: number) =>
  fasce.filter((f) => f.giorno === giorno).reduce((s, f) => s + oreFascia(f), 0)

export function VariazioniOrario({
  dipendenteId,
  profili,
  servizi,
  nonTimbra,
  onAggiornato,
}: {
  dipendenteId: number
  profili: ProfiloOrario[]
  servizi: Servizio[]
  /** Non timbra: oltre alle ore serve l'orario teorico, da cui si genera il mese. */
  nonTimbra: boolean
  /** Ricarica dettaglio ed elenco: le ore attese di tutto il mese cambiano. */
  onAggiornato: () => Promise<void> | void
}) {
  const [ore, setOre] = useState<Record<number, string>>({})
  const [fasce, setFasce] = useState<FasciaProfilo[]>([])
  const [decorrenza, setDecorrenza] = useState('')
  const [motivo, setMotivo] = useState('')
  const [lettera, setLettera] = useState<File | null>(null)
  const [avanzamento, setAvanzamento] = useState<number | null>(null)
  const [azione, setAzione] = useState(false)
  const [errore, setErrore] = useState('')

  // Si parte dalla variazione vigente: registrare la prossima quasi sempre
  // significa cambiare un giorno o due, non riscrivere la settimana da zero.
  useEffect(() => {
    const p = profili[0]
    setOre(
      p
        ? Object.fromEntries(ORE_PROFILO(p).map((n, i) => [i + 1, String(n)]))
        : {},
    )
    // Le fasce si portano dietro senza id: quello che si salva è un orario
    // teorico nuovo, appeso alla variazione nuova, non una modifica di quella
    // vecchia — che deve restare com'è per i mesi già passati.
    setFasce((p?.fasce ?? []).map(({ giorno, oraInizio, oraFine, servizioId }) => ({ giorno, oraInizio, oraFine, servizioId })))
    const oggi = new Date()
    setDecorrenza(`${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-01`)
    setMotivo('')
    setLettera(null)
    setErrore('')
  }, [dipendenteId, profili])

  async function salva() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(decorrenza)) { setErrore('Indica la data di decorrenza'); return }
    setAzione(true); setErrore('')
    try {
      // La lettera si carica PRIMA di registrare la variazione: se il caricamento
      // fallisce non resta una variazione che dichiara un documento inesistente.
      // I byte non passano dal nostro server (vedi lib/core/upload-diretto).
      let file: { url: string; nome: string } | null = null
      if (lettera) {
        setAvanzamento(0)
        const esito = await caricaDirettamente<{ file: { url: string; nome: string } }>({
          file: lettera,
          urlSessione: '/api/timbrature/hr/profilo/allegato',
          datiSessione: { dipendenteId },
          urlConferma: '/api/timbrature/hr/profilo/allegato',
          metodoConferma: 'PUT',
          datiConferma: { dipendenteId },
          onAvanzamento: setAvanzamento,
        })
        file = esito.file
      }

      const r = await fetch('/api/timbrature/hr/profilo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dipendenteId,
          decorrenza,
          ore: Object.fromEntries(Object.entries(ore).map(([k, v]) => [k, Number(v) || 0])),
          motivo: motivo || null,
          file,
          // Solo per chi non timbra. Per gli altri il campo non parte affatto,
          // ed è quello che dice al server "non toccare l'orario teorico" —
          // diverso da un array vuoto, che vorrebbe dire "cancellalo".
          ...(nonTimbra ? { fasce } : {}),
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      await onAggiornato()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setAvanzamento(null)
      setAzione(false)
    }
  }

  async function elimina(id: number, dataDecorrenza: string) {
    if (!confirm(`Cancellare la variazione dal ${gg(dataDecorrenza)}?\n\nDa quel giorno torneranno a valere le ore della variazione precedente, e le ore attese dei mesi interessati si ricalcolano.`)) return
    setAzione(true); setErrore('')
    try {
      const r = await fetch(`/api/timbrature/hr/profilo?id=${id}&dipendenteId=${dipendenteId}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      await onAggiornato()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setAzione(false)
    }
  }

  // Il totale va contato come lo conterà il server: sui giorni con l'orario
  // teorico vince la somma delle fasce, non il numero rimasto nella casella.
  const settimanali = [1, 2, 3, 4, 5, 6, 7].reduce(
    (s, g) => s + (fasce.some((f) => f.giorno === g) ? oreDelGiorno(fasce, g) : Number(ore[g]) || 0),
    0,
  )

  return (
    <div className="border border-gray-200 rounded-xl p-3 mb-5">
      <div className="font-semibold text-gray-700 text-sm mb-1">Variazioni orario</div>
      <p className="text-xs text-gray-500 mb-3">
        Il monte ore vigente a una data è la variazione più recente che parte da quella data o da
        prima. Determina le ore attese di ogni giornata, quindi la completezza, i solleciti e la
        flessibilità: una decorrenza sbagliata riscrive le ore attese dei mesi passati.
      </p>

      {errore && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{errore}</div>
      )}

      <div className="space-y-1 mb-3">
        {profili.length === 0 && (
          <p className="text-xs text-amber-700">
            ⚠ Nessun orario registrato: senza ore attese nessuna giornata risulta mai incompleta e i
            solleciti automatici non partono.
          </p>
        )}
        {profili.map((p) => {
          const v = ORE_PROFILO(p)
          return (
            <div key={p.id} className="flex items-start justify-between gap-2 text-xs border-b border-gray-50 pb-1">
              <div className="min-w-0">
                <span className="font-semibold text-gray-700">dal {gg(p.decorrenza)}</span>
                <span className="text-gray-500">
                  {' '}· {v.map(oreFmt).join('-')} = {oreFmt(v.reduce((s, n) => s + n, 0))} h/sett.
                </span>
                {p.motivo && <div className="text-gray-500">{p.motivo}</div>}
                <div className="text-gray-400">
                  {p.aggiornatoDa ?? '—'}
                  {p.fileUrl && (
                    <>
                      {' · '}
                      <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" className="text-brand-cyan-dark hover:underline">
                        {p.fileNome || 'lettera'}
                      </a>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => elimina(p.id, p.decorrenza)}
                disabled={azione}
                title="Cancella questa variazione"
                className="text-red-500 hover:text-red-700 shrink-0 disabled:opacity-50"
              >
                elimina
              </button>
            </div>
          )
        })}
      </div>

      {nonTimbra && (
        <OrarioTeorico fasce={fasce} servizi={servizi} onChange={setFasce} disabilitato={azione} />
      )}

      <div className="grid grid-cols-7 gap-1 mb-1">
        {GG.map((g, i) => {
          const coperto = fasce.some((f) => f.giorno === i + 1)
          return (
            <div key={g} className="text-center">
              <div className="text-[10px] text-gray-400">{g}</div>
              <input
                value={coperto ? oreFmt(oreDelGiorno(fasce, i + 1)) : (ore[i + 1] ?? '')}
                onChange={(e) => setOre({ ...ore, [i + 1]: e.target.value })}
                readOnly={coperto}
                title={coperto ? 'Ore calcolate dall’orario teorico' : undefined}
                className={`w-full border rounded px-1 py-1 text-center text-sm ${
                  coperto ? 'border-gray-200 bg-gray-100 text-gray-500' : 'border-gray-300'
                }`}
                inputMode="decimal"
              />
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-gray-400 mb-2">
        Totale settimanale: {oreFmt(settimanali)} h
        {fasce.length > 0 && ' — i giorni in grigio li detta l’orario teorico'}
      </p>

      <div className="flex flex-wrap gap-2 items-end mb-2">
        <label className="text-xs text-gray-600">
          Decorrenza
          <input
            type="date"
            value={decorrenza}
            onChange={(e) => setDecorrenza(e.target.value)}
            className="block border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5"
          />
        </label>
        <label className="text-xs text-gray-600 flex-1 min-w-[180px]">
          Motivo
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="es. passaggio a part-time 20 ore su richiesta del dipendente"
            className="block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5"
          />
        </label>
      </div>

      <Allegato
        etichetta="Lettera di variazione firmata"
        file={lettera}
        onChange={setLettera}
        aiuto="Finisce nella cartella personale del dipendente su SharePoint, collegata a questa variazione."
        disabilitato={azione}
      />
      {avanzamento != null && (
        <p className="text-xs text-gray-500 mb-2">Carico la lettera… {avanzamento}%</p>
      )}

      <button
        onClick={salva}
        disabled={azione}
        className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
      >
        {azione ? 'Registro…' : 'Registra variazione'}
      </button>
    </div>
  )
}
