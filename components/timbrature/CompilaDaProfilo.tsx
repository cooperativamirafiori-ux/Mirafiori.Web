'use client'

/**
 * Il bottone "Compila il mese" di chi non timbra.
 *
 * Sta in `components/` e non dentro una delle due pagine perché lo premono in
 * tre posti diversi con la stessa identica semantica: il responsabile dal
 * cruscotto di validazione, le HR dal loro, e la persona stessa dalla propria
 * pagina Timbrature (i responsabili non timbrano, ma il foglio ore per Pulse se
 * lo fanno da soli). Duplicarlo tre volte vorrebbe dire tre messaggi di esito
 * che col tempo diventano diversi.
 *
 * Due bottoni e non uno: "Compila" riempie i buchi e non tocca niente,
 * "Rigenera" butta via quello che aveva generato lui e riscrive. Il secondo
 * serve quando l'orario teorico era sbagliato — correggerlo dopo non risistema
 * da sé un mese già compilato — ed è distruttivo quel tanto che basta da
 * meritare una conferma, non un clic distratto accanto all'altro.
 */

import { useState } from 'react'
import type { EsitoCompilazioneProfilo } from '@/types/timbrature'

export function CompilaDaProfilo({
  dipendenteId,
  nome,
  anno,
  mese,
  meseNome,
  haOrarioTeorico,
  bloccato,
  onFatto,
}: {
  /** Assente = lo si sta facendo su di sé. */
  dipendenteId?: number
  nome?: string
  anno: number
  mese: number
  meseNome: string
  haOrarioTeorico: boolean
  /** Il mese è già validato o confermato: non si riscrive. */
  bloccato?: boolean
  onFatto: () => Promise<void> | void
}) {
  const [azione, setAzione] = useState(false)
  const [esito, setEsito] = useState<EsitoCompilazioneProfilo | null>(null)
  const [errore, setErrore] = useState('')

  async function compila(rigenera: boolean) {
    if (rigenera) {
      const chi = nome ? `di ${nome}` : 'tuo'
      if (
        !confirm(
          `Rigenerare ${meseNome} ${anno} ${chi}?\n\n` +
            'Le giornate generate dall\'orario teorico vengono cancellate e riscritte. ' +
            'Ferie, malattie e righe corrette a mano restano dove sono.',
        )
      ) return
    }
    setAzione(true); setErrore(''); setEsito(null)
    try {
      const r = await fetch('/api/timbrature/da-profilo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anno, mese, rigenera, ...(dipendenteId ? { dipendenteId } : {}) }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      setEsito(d as EsitoCompilazioneProfilo)
      await onFatto()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setAzione(false)
    }
  }

  return (
    <div className="border border-brand-cyan/40 bg-brand-cyan-light/20 rounded-xl p-3 mb-5">
      <div className="font-semibold text-gray-700 text-sm mb-1">Foglio ore da orario teorico</div>
      <p className="text-xs text-gray-500 mb-3">
        {nome ? `${nome} non timbra` : 'Non timbri'}: il mese si riempie con l’orario teorico, e
        resta da inserire solo quello che l’orario non sa — ferie, malattia, permessi. Si può premere
        più volte: le giornate già scritte non vengono toccate.
      </p>

      {!haOrarioTeorico ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠ Nessun orario teorico impostato: non c’è da cosa generare le giornate. Va inserito dalle
          Risorse Umane, in “Variazioni orario”.
        </div>
      ) : bloccato ? (
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Il foglio di {meseNome} è già stato validato: per rifarlo va prima riaperto.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => compila(false)}
            disabled={azione}
            className="text-sm bg-brand-cyan-dark text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
          >
            {azione ? 'Compilo…' : `Compila ${meseNome}`}
          </button>
          <button
            onClick={() => compila(true)}
            disabled={azione}
            className="text-sm border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
            title="Cancella le giornate generate e le riscrive dall’orario teorico aggiornato"
          >
            Rigenera
          </button>
        </div>
      )}

      {errore && (
        <div className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{errore}</div>
      )}
      {esito && (
        <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {esito.avviso}
          {esito.errori.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-red-700">
              {esito.errori.slice(0, 5).map((e) => (
                <li key={e.data}>{e.data.split('-').reverse().join('/')}: {e.motivo}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
