'use client'

/**
 * L'orario tipo di chi non timbra: a che ora entra, a che ora esce, su quale
 * servizio, giorno per giorno.
 *
 * Serve solo a chi ha la spunta "Non timbra". Il monte ore da solo non basta a
 * generare un mese: una riga di lavoro vuole ingresso e uscita, e "38 ore
 * settimanali" non dice a che ora si entra.
 *
 * PERCHÉ "SCRIVI UNA VOLTA E APPLICA AI GIORNI". La forma naturale sarebbe una
 * griglia lunedì-domenica da compilare sette volte, ma un orario di lavoro è
 * quasi sempre la stessa riga ripetuta cinque volte: farla scrivere cinque
 * volte è cinque volte l'occasione di sbagliare un carattere, e l'errore
 * finirebbe in un foglio ore che nessuno rilegge riga per riga. Qui si scrive
 * una volta, si spunta su quali giorni vale, e poi si ritocca il giorno diverso.
 */

import { useState } from 'react'
import type { FasciaProfilo, Servizio } from '@/types/timbrature'

const GG = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const FERIALI = [1, 2, 3, 4, 5]

const oreFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))
const min = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))

/** Ore di una fascia. Le fasce non scavallano la mezzanotte, quindi è una sottrazione. */
export function oreFascia(f: { oraInizio: string; oraFine: string }): number {
  return Math.round(((min(f.oraFine) - min(f.oraInizio)) / 60) * 100) / 100
}

/** Righe dell'orario tipo che si sta componendo, prima di applicarle ai giorni. */
interface RigaTipo {
  oraInizio: string
  oraFine: string
  servizioId: number | ''
}

export function OrarioTeorico({
  fasce,
  servizi,
  onChange,
  disabilitato,
}: {
  fasce: FasciaProfilo[]
  servizi: Servizio[]
  onChange: (f: FasciaProfilo[]) => void
  disabilitato?: boolean
}) {
  const lavoro = servizi.filter((s) => s.tipoVoce === 'lavoro')
  const [righe, setRighe] = useState<RigaTipo[]>([{ oraInizio: '09:00', oraFine: '17:00', servizioId: '' }])
  const [giorni, setGiorni] = useState<number[]>(FERIALI)
  const [errore, setErrore] = useState('')

  function applica() {
    setErrore('')
    if (!giorni.length) { setErrore('Scegli almeno un giorno'); return }
    for (const r of righe) {
      if (!r.servizioId) { setErrore('Scegli il servizio su ogni riga'); return }
      if (min(r.oraFine) <= min(r.oraInizio)) {
        setErrore(`L'uscita (${r.oraFine}) deve essere dopo l'ingresso (${r.oraInizio})`)
        return
      }
    }
    // I giorni scelti si riscrivono per intero: "applica" sostituisce quello
    // che c'era, non ci si somma sopra. Sommare produrrebbe doppioni invisibili
    // a chi preme due volte.
    const altri = fasce.filter((f) => !giorni.includes(f.giorno))
    const nuove: FasciaProfilo[] = giorni.flatMap((g) =>
      righe.map((r) => ({
        giorno: g as FasciaProfilo['giorno'],
        oraInizio: r.oraInizio,
        oraFine: r.oraFine,
        servizioId: Number(r.servizioId),
      })),
    )
    onChange([...altri, ...nuove].sort((a, b) => a.giorno - b.giorno || a.oraInizio.localeCompare(b.oraInizio)))
  }

  const totale = fasce.reduce((s, f) => s + oreFascia(f), 0)

  return (
    <div className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50/50">
      <div className="font-semibold text-gray-700 text-sm mb-1">Orario teorico</div>
      <p className="text-xs text-gray-500 mb-3">
        Da qui si genera il foglio ore con “Compila il mese”. Scrivi l’orario una volta, spunta i
        giorni in cui vale e applicalo; poi correggi i giorni diversi. Due righe sullo stesso giorno
        sono la pausa pranzo.
      </p>

      {errore && (
        <div className="mb-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{errore}</div>
      )}

      {/* --- compositore ------------------------------------------------- */}
      {righe.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2 mb-2">
          <label className="text-[11px] text-gray-500">
            Ingresso
            <input
              type="time"
              value={r.oraInizio}
              disabled={disabilitato}
              onChange={(e) => setRighe(righe.map((x, j) => (j === i ? { ...x, oraInizio: e.target.value } : x)))}
              className="block border border-gray-300 rounded px-2 py-1 text-sm mt-0.5"
            />
          </label>
          <label className="text-[11px] text-gray-500">
            Uscita
            <input
              type="time"
              value={r.oraFine}
              disabled={disabilitato}
              onChange={(e) => setRighe(righe.map((x, j) => (j === i ? { ...x, oraFine: e.target.value } : x)))}
              className="block border border-gray-300 rounded px-2 py-1 text-sm mt-0.5"
            />
          </label>
          <label className="text-[11px] text-gray-500 flex-1 min-w-[160px]">
            Servizio
            <select
              value={r.servizioId}
              disabled={disabilitato}
              onChange={(e) =>
                setRighe(righe.map((x, j) => (j === i ? { ...x, servizioId: e.target.value ? Number(e.target.value) : '' } : x)))
              }
              className="block w-full border border-gray-300 rounded px-2 py-1 text-sm mt-0.5"
            >
              <option value="">— scegli —</option>
              {lavoro.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </label>
          {righe.length > 1 && (
            <button
              type="button"
              onClick={() => setRighe(righe.filter((_, j) => j !== i))}
              disabled={disabilitato}
              className="text-xs text-red-500 hover:text-red-700 pb-1.5 disabled:opacity-50"
            >
              togli
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => setRighe([...righe, { oraInizio: '14:00', oraFine: '18:00', servizioId: righe[0]?.servizioId ?? '' }])}
        disabled={disabilitato}
        className="text-xs text-brand-cyan-dark hover:underline mb-3 disabled:opacity-50"
      >
        + aggiungi una fascia (pausa pranzo)
      </button>

      <div className="flex flex-wrap items-center gap-1 mb-2">
        {GG.map((g, i) => {
          const n = i + 1
          const on = giorni.includes(n)
          return (
            <button
              key={g}
              type="button"
              disabled={disabilitato}
              onClick={() => setGiorni(on ? giorni.filter((x) => x !== n) : [...giorni, n])}
              className={`text-xs rounded-full px-2.5 py-1 border transition disabled:opacity-50 ${
                on ? 'bg-brand-cyan-dark text-white border-brand-cyan-dark' : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              {g}
            </button>
          )
        })}
        <button
          type="button"
          onClick={applica}
          disabled={disabilitato}
          className="text-xs bg-gray-800 text-white rounded-lg px-3 py-1.5 font-semibold ml-1 disabled:opacity-50"
        >
          Applica ai giorni scelti
        </button>
      </div>

      {/* --- la settimana risultante ------------------------------------- */}
      <div className="border-t border-gray-200 pt-2 mt-1">
        {fasce.length === 0 ? (
          <p className="text-xs text-amber-700">
            ⚠ Nessun orario teorico: “Compila il mese” non ha da cosa generare le giornate.
          </p>
        ) : (
          <>
            {GG.map((g, i) => {
              const n = i + 1
              const delGiorno = fasce.filter((f) => f.giorno === n)
              return (
                <div key={g} className="flex items-start gap-2 text-xs py-0.5">
                  <span className="w-8 shrink-0 text-gray-400">{g}</span>
                  {delGiorno.length === 0 ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <div className="flex-1 min-w-0">
                      {delGiorno.map((f, k) => (
                        <div key={k} className="flex items-center gap-2">
                          <span className="text-gray-700 font-medium">{f.oraInizio}–{f.oraFine}</span>
                          <span className="text-gray-500 truncate">
                            {servizi.find((s) => s.id === f.servizioId)?.nome ?? `servizio ${f.servizioId}`}
                          </span>
                          <button
                            type="button"
                            disabled={disabilitato}
                            onClick={() => onChange(fasce.filter((x) => x !== f))}
                            className="text-red-400 hover:text-red-600 shrink-0 disabled:opacity-50"
                            title="Togli questa fascia"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {delGiorno.length > 0 && (
                    <span className="text-gray-400 shrink-0">
                      {oreFmt(delGiorno.reduce((s, f) => s + oreFascia(f), 0))} h
                    </span>
                  )}
                </div>
              )
            })}
            <p className="text-[11px] text-gray-400 mt-1">
              Totale settimanale dall’orario teorico: {oreFmt(totale)} h — è questo che sovrascrive
              il monte ore dei giorni coperti.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
