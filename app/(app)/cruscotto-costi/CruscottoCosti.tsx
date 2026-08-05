'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CostoPerStruttura } from '@/types/manutenzioni'

interface Props {
  righe: CostoPerStruttura[]
  anni: number[]
  anno: number
  totaleComplessivo: number
  numMovimenti: number
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
  totaleComplessivo,
  numMovimenti,
}: Props) {
  const router = useRouter()
  const [aperta, setAperta] = useState<number | null>(null)

  const conCosti = righe.filter((r) => r.totale > 0)

  return (
    <div className="space-y-6">
      {/* Header + selettore anno */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-gray-700">
          Costi per struttura — {anno}
        </h2>
        <select
          value={anno}
          onChange={(e) => router.push(`/cruscotto-costi?anno=${e.target.value}`)}
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
          <p className="text-xs text-gray-500 mt-1">Strutture con costi</p>
        </div>
        <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
          <p className="text-2xl font-bold text-gray-700">{numMovimenti}</p>
          <p className="text-xs text-gray-500 mt-1">Movimenti</p>
        </div>
      </div>

      {/* Elenco strutture */}
      {numMovimenti === 0 ? (
        <div className="bg-white rounded-2xl shadow p-10 text-center text-gray-400">
          Nessun costo registrato per il {anno}
        </div>
      ) : (
        <div className="space-y-3">
          {righe.map((r) => {
            const isOpen = aperta === r.strutturaId
            const haCosti = r.totale > 0
            return (
              <div
                key={r.strutturaId}
                className={`bg-white rounded-2xl shadow-sm border ${
                  haCosti ? 'border-gray-100' : 'border-gray-100 opacity-60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => haCosti && setAperta(isOpen ? null : r.strutturaId)}
                  disabled={!haCosti}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left disabled:cursor-default"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate">
                      {r.strutturaLabel}
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
