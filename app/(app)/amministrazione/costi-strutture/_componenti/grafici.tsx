'use client'

/**
 * Due grafici fatti a mano, senza librerie: una barra orizzontale divisa per
 * parziali e le colonne dei mesi impilate. Reggono a 375 px.
 */

import { PARZIALI, type Parziale } from '@/types/costi-strutture'
import { MESI, MESI_LUNGHI, euro } from './formato'

export function BarraParziali({ parziali, altezza = 'h-3' }: { parziali: Record<Parziale, number>; altezza?: string }) {
  const tot = PARZIALI.reduce((s, p) => s + Math.max(0, parziali[p.chiave]), 0)
  if (tot <= 0) return <div className={`${altezza} rounded-full bg-gray-100`} />
  return (
    <div className={`${altezza} rounded-full bg-gray-100 overflow-hidden flex`}>
      {PARZIALI.filter((p) => parziali[p.chiave] > 0).map((p) => (
        <span
          key={p.chiave}
          title={`${p.etichetta}: ${euro(parziali[p.chiave])}`}
          style={{ width: `${(parziali[p.chiave] / tot) * 100}%`, background: p.colore }}
          className="h-full border-r border-white last:border-r-0"
        />
      ))}
    </div>
  )
}

export function Legenda({ parziali, solo }: { parziali: Record<Parziale, number>; solo?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600">
      {PARZIALI.filter((p) => !solo || parziali[p.chiave] !== 0).map((p) => (
        <li key={p.chiave} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.colore }} />
          {p.etichetta}
          <span className="font-semibold text-gray-800">{euro(parziali[p.chiave])}</span>
        </li>
      ))}
    </ul>
  )
}

/** Colonne dei mesi, ognuna impilata per parziale. `limite` = ultimo mese contato. */
export function MesiImpilati({ perParziale, limite }: { perParziale: Record<Parziale, number[]>; limite: number }) {
  const totali = MESI.map((_, m) => PARZIALI.reduce((s, p) => s + Math.max(0, perParziale[p.chiave][m]), 0))
  const max = Math.max(1, ...totali)
  return (
    <div>
      <div className="flex items-end gap-1 h-32">
        {MESI.map((_, m) => (
          <div
            key={m}
            className={`flex-1 h-full flex flex-col-reverse rounded-t ${m > limite ? 'opacity-30' : ''}`}
            title={`${MESI_LUNGHI[m]}: ${euro(totali[m])}`}
          >
            {PARZIALI.map((p) => {
              const v = Math.max(0, perParziale[p.chiave][m])
              return v > 0 ? <span key={p.chiave} style={{ height: `${(v / max) * 100}%`, background: p.colore }} className="w-full first:rounded-b-none" /> : null
            })}
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        {MESI.map((l, m) => (
          <span key={m} className="flex-1 text-center text-[10px] text-gray-400">{l}</span>
        ))}
      </div>
    </div>
  )
}

/** Colonne semplici di una serie (consumi di un'utenza). */
export function Colonne({ valori, colore, unita }: { valori: number[]; colore: string; unita: string }) {
  const max = Math.max(1, ...valori)
  return (
    <div>
      <div className="flex items-end gap-1 h-16">
        {valori.map((v, m) => (
          <span
            key={m}
            title={`${MESI_LUNGHI[m]}: ${Math.round(v).toLocaleString('it-IT')} ${unita}`}
            className="flex-1 rounded-t"
            style={{ height: `${(Math.max(0, v) / max) * 100}%`, background: colore, minHeight: v > 0 ? 2 : 0 }}
          />
        ))}
      </div>
      <div className="flex gap-1 mt-0.5">
        {MESI.map((l, m) => (
          <span key={m} className="flex-1 text-center text-[10px] text-gray-400">{l}</span>
        ))}
      </div>
    </div>
  )
}
