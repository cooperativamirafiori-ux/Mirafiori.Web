'use client'

import { useState } from 'react'
import { Pill } from '@/components/ui/Pill'
import { Vuoto } from '@/components/ui/Vuoto'
import type { StrutturaCc, UtenzaConUltima } from '@/types/utenze'
import { EMOJI_TIPO, data, euro, numero } from '../../costi-strutture/_componenti/formato'

export interface GruppoStruttura {
  /** null = utenze senza struttura. */
  struttura: StrutturaCc | null
  utenze: UtenzaConUltima[]
}

/**
 * Prima l'elenco delle strutture, ognuna con quante utenze ha e cosa c'è da
 * sistemare; toccandone una si aprono le sue utenze. Con una ricerca in corso
 * le strutture che contengono il risultato si aprono da sole.
 */
export function ElencoStrutture({
  gruppi,
  anno,
  cercando,
  percentualeStorta,
  onApriUtenza,
  onNuova,
}: {
  gruppi: GruppoStruttura[]
  anno: number
  cercando: boolean
  percentualeStorta: (u: UtenzaConUltima) => number | null
  onApriUtenza: (u: UtenzaConUltima) => void
  onNuova: (strutturaId: number | null) => void
}) {
  const [aperta, setAperta] = useState<string | null>(null)
  if (!gruppi.length) return <Vuoto>Nessuna struttura trovata.</Vuoto>

  return (
    <div className="space-y-2">
      {gruppi.map((g) => {
        const chiave = g.struttura ? String(g.struttura.id) : 'senza'
        const aprire = cercando || aperta === chiave
        const problemi = g.utenze.filter((u) => u.segnaposto || !u.strutturaId || percentualeStorta(u) !== null).length
        const conta = (t: string) => g.utenze.filter((u) => u.tipo === t).length
        const ultime = g.utenze.reduce((s, u) => s + (u.ultima?.importo ?? 0), 0)
        const bollette = g.utenze.reduce((s, u) => s + u.bolletteAnno, 0)

        return (
          <div key={chiave} className={`bg-white rounded-2xl border ${aprire ? 'border-brand-cyan shadow-sm' : 'border-gray-100'}`}>
            <button
              onClick={() => setAperta(aperta === chiave ? null : chiave)}
              className="w-full text-left p-4 flex items-center gap-3"
              aria-expanded={aprire}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-gray-400">
                  {g.struttura ? `${g.struttura.codice}${g.struttura.ccNome ? ` · ${g.struttura.ccNome}` : ''}` : 'Da sistemare'}
                </p>
                <p className={`font-bold leading-tight ${g.utenze.length ? 'text-gray-800' : 'text-gray-400'}`}>
                  {g.struttura ? g.struttura.nome : 'Utenze senza struttura'}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
                  {g.utenze.length === 0 && <span>nessuna utenza</span>}
                  {(['luce', 'gas', 'acqua'] as const).map((t) =>
                    conta(t) ? (
                      <span key={t}>
                        {EMOJI_TIPO[t]} {conta(t)}
                      </span>
                    ) : null,
                  )}
                  {bollette > 0 && <span>{bollette} bollette nel {anno}</span>}
                  {ultime > 0 && <span>ultime: {euro(ultime)}</span>}
                  {problemi > 0 && <Pill tono="ambra" text={`${problemi} da sistemare`} />}
                </div>
              </div>
              <span className={`text-gray-400 transition-transform ${aprire ? 'rotate-90' : ''}`}>›</span>
            </button>

            {aprire && (
              <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
                {g.utenze.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => onApriUtenza(u)}
                    className="w-full text-left bg-gray-50 rounded-xl p-3 hover:bg-cyan-50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{EMOJI_TIPO[u.tipo]}</span>
                      <span className="font-mono text-sm font-semibold text-gray-800 break-all">{u.codice}</span>
                      {u.percentuale < 100 && <Pill tono="neutro" text={`${numero(u.percentuale)}%`} />}
                      {u.segnaposto && <Pill tono="ambra" text="codice da completare" />}
                      {!u.strutturaId && <Pill tono="rosso" text="senza struttura" />}
                      {percentualeStorta(u) !== null && <Pill tono="rosso" text={`il codice somma al ${numero(percentualeStorta(u)!)}%`} />}
                      {u.fornitore && <span className="text-xs text-gray-500">{u.fornitore}</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {u.ultima
                        ? `Ultima bolletta ${data(u.ultima.data)} · ${euro(u.ultima.importo, 2)}` +
                          (u.ultima.consumo != null ? ` · ${numero(u.ultima.consumo)} ${u.ultima.unita ?? ''}` : '') +
                          (u.ultima.periodoDal ? ` · ${data(u.ultima.periodoDal)} → ${data(u.ultima.periodoAl)}` : '') +
                          ` · ${u.bolletteAnno} nel ${anno}`
                        : 'Nessuna bolletta arrivata finora'}
                    </p>
                    {u.note && <p className="text-xs text-gray-400 mt-1">{u.note}</p>}
                  </button>
                ))}
                {g.struttura && (
                  <button
                    onClick={() => onNuova(g.struttura!.id)}
                    className="w-full px-4 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm font-semibold text-gray-600 hover:border-brand-cyan"
                  >
                    + Aggiungi un&apos;utenza a {g.struttura.nome}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
