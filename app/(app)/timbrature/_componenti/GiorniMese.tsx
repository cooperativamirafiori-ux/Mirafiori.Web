'use client'

/**
 * Il mese giorno per giorno, uguale per il dipendente e per chi valida.
 *
 * Il cruscotto RU mostrava un elenco piatto delle sole righe registrate. Ma i
 * giorni scoperti non hanno righe: sparivano proprio dalla lista di chi deve
 * dire "questo foglio ore e' corretto". E senza il monte ore atteso accanto,
 * una giornata da 4 h non si sa se sia completa o meta'. Qui si vede una card
 * per giornata, con le ore fatte, quelle previste e le righe dentro.
 */

import { useMemo, useState } from 'react'
import { Pill } from '@/components/ui/Pill'
import type { RiepilogoPeriodo, Timbratura } from '@/types/timbrature'
import { oreLabel, oggiYmd, weekdayShort } from './mese'

export function GiorniMese({
  riepilogo,
  timbrature,
  oggi = oggiYmd(),
  modificabile = false,
  fuoriFinestra,
  onAggiungi,
  onModifica,
  onElimina,
}: {
  riepilogo: RiepilogoPeriodo
  timbrature: Timbratura[]
  oggi?: string
  modificabile?: boolean
  /** Giornata per cui le ore di lavoro non sono piu' correggibili da chi guarda. */
  fuoriFinestra?: (data: string) => boolean
  onAggiungi?: (data: string) => void
  onModifica?: (t: Timbratura) => void
  onElimina?: (id: string) => void
}) {
  const [filtro, setFiltro] = useState<'tutti' | 'problemi'>('tutti')

  const perGiorno = useMemo(() => {
    const m = new Map<string, Timbratura[]>()
    for (const t of timbrature) {
      const a = m.get(t.data) ?? []
      a.push(t)
      m.set(t.data, a)
    }
    return m
  }, [timbrature])

  const daSistemare = useMemo(
    () => riepilogo.giorni.filter((g) => !g.festivo && g.oreAttese > 0 && !g.completo && g.data < oggi),
    [riepilogo.giorni, oggi],
  )

  const giorni = filtro === 'problemi' ? daSistemare : riepilogo.giorni

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">I giorni del mese</span>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setFiltro('tutti')}
            className={`px-2.5 py-1 rounded-lg border ${filtro === 'tutti' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'}`}
          >
            tutti
          </button>
          <button
            onClick={() => setFiltro('problemi')}
            className={`px-2.5 py-1 rounded-lg border ${filtro === 'problemi' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'}`}
          >
            solo da sistemare{daSistemare.length > 0 ? ` (${daSistemare.length})` : ''}
          </button>
        </div>
      </div>

      {giorni.length === 0 && (
        <div className="text-center text-sm text-gray-400 py-6 border border-dashed border-gray-200 rounded-xl">
          {filtro === 'problemi' ? 'Nessuna giornata da sistemare.' : 'Nessun giorno da mostrare.'}
        </div>
      )}

      {giorni.map((g) => {
        const righe = perGiorno.get(g.data) ?? []
        const ore = righe.reduce((s, t) => s + t.ore, 0)
        const oreLavoro = righe.reduce((s, t) => s + (t.tipoVoce === 'lavoro' ? t.ore : 0), 0)
        const scoperto = !g.festivo && g.oreAttese > 0 && !g.completo && g.data < oggi
        const futuro = g.data > oggi
        const chiuso = fuoriFinestra?.(g.data) ?? false

        return (
          <div
            key={g.data}
            className={`bg-white rounded-xl border shadow-sm ${scoperto ? 'border-amber-300' : 'border-gray-100'}`}
          >
            <div className="flex items-center justify-between px-4 py-2.5 gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-center w-10 shrink-0">
                  <div className="text-xs text-gray-400">{weekdayShort(g.data)}</div>
                  <div className={`font-bold ${futuro ? 'text-gray-300' : 'text-gray-700'}`}>
                    {Number(g.data.slice(8, 10))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {g.festivo ? (
                    <>
                      <span className="text-xs font-semibold text-rose-500">{g.festivitaNome}</span>
                      {oreLavoro > 0.001 && (
                        <Pill text={`lavoro in festività · ${oreLabel(oreLavoro)} h`} tono="ambra" />
                      )}
                    </>
                  ) : (
                    <>
                      <span className={`text-xs ${futuro ? 'text-gray-300' : 'text-gray-500'}`}>
                        {oreLabel(ore)} / {oreLabel(g.oreAttese)} h
                      </span>
                      {scoperto && <Pill text="da sistemare" tono="ambra" />}
                      {g.voci.map((v) => (
                        <Pill key={v} text={v} tono="viola" />
                      ))}
                      {g.notte && <Pill text="notte" tono="azzurro" />}
                      {g.reperibilita && <Pill text="reperibilità" tono="azzurro" />}
                    </>
                  )}
                </div>
              </div>
              {modificabile && onAggiungi && (
                <button
                  onClick={() => onAggiungi(g.data)}
                  title={chiuso ? 'Fuori dai tre giorni: solo ferie, permessi o malattia' : undefined}
                  className={`text-sm font-semibold shrink-0 hover:underline ${chiuso ? 'text-gray-400' : 'text-brand-cyan-dark'}`}
                >
                  + riga
                </button>
              )}
            </div>

            {righe.length > 0 && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {righe.map((t) => (
                  <RigaVoce
                    key={t.id}
                    t={t}
                    modificabile={modificabile && !(t.tipoVoce === 'lavoro' && chiuso)}
                    onModifica={onModifica}
                    onElimina={onElimina}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function RigaVoce({
  t,
  modificabile,
  onModifica,
  onElimina,
}: {
  t: Timbratura
  modificabile: boolean
  onModifica?: (t: Timbratura) => void
  onElimina?: (id: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
      <div className="min-w-0">
        <span className={`font-medium ${t.tipoVoce === 'giustificativo' ? 'text-accent-purple' : 'text-gray-800'}`}>
          {t.servizioNome}
        </span>
        <span className="text-gray-400 ml-2 font-semibold">{oreLabel(t.ore)} h</span>
        <span className="inline-flex gap-1 ml-1.5 align-middle">
          {t.notte && <Pill text="notte" tono="azzurro" />}
          {t.reperibilita && <Pill text="reperibilità" tono="azzurro" />}
          {t.mutua && <Pill text="mutua" tono="rosso" />}
          {/* Chi ha scritto la riga: "mi hanno cambiato le ore" non deve essere
              una discussione senza prove. */}
          {t.perConto && <Pill text="inserita dal responsabile" tono="ambra" />}
        </span>
        <div className="text-xs text-gray-400 truncate">
          {t.oraInizio && t.oraFine && (
            <span>
              {t.oraInizio}–{t.oraFine}
              {t.note ? ' · ' : ''}
            </span>
          )}
          {t.note}
        </div>
      </div>
      {modificabile && (
        <div className="flex gap-3 text-xs shrink-0">
          {onModifica && (
            <button onClick={() => onModifica(t)} className="text-gray-500 hover:text-gray-800">
              Modifica
            </button>
          )}
          {onElimina && (
            <button onClick={() => onElimina(t.id)} className="text-red-500 hover:text-red-700">
              Elimina
            </button>
          )}
        </div>
      )}
    </div>
  )
}
