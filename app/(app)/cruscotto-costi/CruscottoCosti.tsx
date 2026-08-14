'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CostoAggregato, VistaCosti } from '@/types/manutenzioni'

interface Props {
  righe: CostoAggregato[]
  anni: number[]
  anno: number
  vista: VistaCosti
  totaleComplessivo: number
  numMovimenti: number
  /** Movimenti privi della dimensione in uso: da sistemare. */
  senzaDimensione: number
}

const eur = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n)

const dataBreve = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('it-IT')
}

export function CruscottoCosti({
  righe,
  anni,
  anno,
  vista,
  totaleComplessivo,
  numMovimenti,
  senzaDimensione,
}: Props) {
  const router = useRouter()
  const [aperta, setAperta] = useState<number | null>(null)

  const conCosti = righe.filter((r) => r.totale > 0)
  const perStruttura = vista === 'struttura'
  const vai = (v: VistaCosti, a: number) => router.push(`/cruscotto-costi?anno=${a}&vista=${v}`)

  return (
    <div className="space-y-6">
      {/* Interruttore fra le due viste */}
      <div className="inline-flex bg-gray-100 rounded-xl p-1 w-full">
        {(['centro-di-costo', 'struttura'] as VistaCosti[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => vai(v, anno)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm transition ${
              vista === v
                ? 'bg-white shadow-sm font-semibold text-primary-dark'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {v === 'centro-di-costo' ? 'Per centro di costo' : 'Per struttura'}
          </button>
        ))}
      </div>

      {/* Header + selettore anno */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-gray-700">
          {perStruttura ? 'Costi per struttura' : 'Costi per centro di costo'} — {anno}
        </h2>
        <select
          value={anno}
          onChange={(e) => vai(vista, Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {anni.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
          <p className="text-2xl font-bold text-primary">{eur(totaleComplessivo)}</p>
          <p className="text-xs text-gray-500 mt-1">Totale {anno}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
          <p className="text-2xl font-bold text-gray-700">{conCosti.length}</p>
          <p className="text-xs text-gray-500 mt-1">
            {perStruttura ? 'Strutture con costi' : 'Centri con costi'}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
          <p className="text-2xl font-bold text-gray-700">{numMovimenti}</p>
          <p className="text-xs text-gray-500 mt-1">Movimenti</p>
        </div>
      </div>

      {senzaDimensione > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-3">
          {senzaDimensione}{' '}
          {senzaDimensione === 1 ? 'movimento non è attribuito' : 'movimenti non sono attribuiti'}{' '}
          {perStruttura ? 'a nessuna struttura' : 'a nessun centro di costo'}: li trovi
          raggruppati in fondo.
        </div>
      )}

      {/* Elenco */}
      {numMovimenti === 0 ? (
        <div className="bg-white rounded-2xl shadow p-10 text-center text-gray-400">
          Nessun costo registrato per il {anno}
        </div>
      ) : (
        <div className="space-y-3">
          {righe.map((r) => {
            const isOpen = aperta === r.chiaveId
            const haCosti = r.totale > 0
            return (
              <div
                key={r.chiaveId}
                className={`bg-white rounded-2xl shadow-sm border ${
                  haCosti ? 'border-gray-100' : 'border-gray-100 opacity-60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => haCosti && setAperta(isOpen ? null : r.chiaveId)}
                  disabled={!haCosti}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left disabled:cursor-default"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate">
                      {r.etichetta}
                    </p>
                    {haCosti && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {r.movimenti.length} movimenti ·{' '}
                        {Object.keys(r.perCategoria).length} categorie
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`font-bold ${haCosti ? 'text-primary-dark' : 'text-gray-400'}`}
                    >
                      {eur(r.totale)}
                    </span>
                    {haCosti && (
                      <span
                        className={`text-gray-400 transition-transform ${
                          isOpen ? 'rotate-90' : ''
                        }`}
                      >
                        ›
                      </span>
                    )}
                  </div>
                </button>

                {isOpen && haCosti && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">
                    {/* Ripartizione per categoria */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                        Per categoria
                      </p>
                      <div className="space-y-1">
                        {Object.entries(r.perCategoria)
                          .sort((a, b) => b[1] - a[1])
                          .map(([cat, imp]) => (
                            <div key={cat} className="flex justify-between text-sm">
                              <span className="text-gray-600">{cat}</span>
                              <span className="text-gray-800 font-medium">{eur(imp)}</span>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Elenco movimenti */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                        Movimenti
                      </p>
                      <div className="divide-y divide-gray-100">
                        {r.movimenti.map((m) => (
                          <div key={m.id} className="py-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-gray-800 truncate">{m.title}</p>
                              <p className="text-xs text-gray-500">
                                {dataBreve(m.dataCosto)} · {m.categoria}
                                {m.fornitore ? ` · ${m.fornitore}` : ''}
                                {m.fonte ? ` · ${m.fonte}` : ''}
                              </p>
                            </div>
                            <span className="text-sm font-medium text-gray-800 shrink-0">
                              {eur(m.importo)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
