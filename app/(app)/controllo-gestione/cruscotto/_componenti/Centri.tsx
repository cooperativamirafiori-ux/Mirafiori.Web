'use client'

/**
 * Le schede dei centri di costo. Card impilate su telefono, griglia da `sm:`:
 * niente tabella, il tocco sulla card apre il dettaglio.
 */

import { useMemo, useState } from 'react'
import type { CentroCruscotto } from '@/types/cruscotto'
import { Linea } from './grafici'
import { coloreArea, euro, euroBreve, gruppoArea, numero, useMontato } from './formato'
import { SchedaCentro } from './SchedaCentro'

type Ordine = 'costi' | 'ore' | 'nome'

export function Centri({
  centri,
  meseInizio,
  meseUltimo,
  esempio,
  filtroArea,
  onTogliFiltro,
}: {
  centri: CentroCruscotto[]
  meseInizio: number
  meseUltimo: number
  esempio: boolean
  filtroArea: string | null
  onTogliFiltro: () => void
}) {
  const [ordine, setOrdine] = useState<Ordine>('costi')
  const [aperto, setAperto] = useState<string | null>(null)

  const elenco = useMemo(() => {
    const l = filtroArea ? centri.filter((c) => gruppoArea(c.area) === filtroArea) : [...centri]
    const costo = (c: CentroCruscotto) => c.costiFatture + c.costiDiretti
    if (ordine === 'costi') l.sort((a, b) => costo(b) - costo(a) || a.nome.localeCompare(b.nome, 'it'))
    if (ordine === 'ore') l.sort((a, b) => b.ore - a.ore || a.nome.localeCompare(b.nome, 'it'))
    if (ordine === 'nome') l.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
    return l
  }, [centri, filtroArea, ordine])

  const max = Math.max(1, ...centri.map((c) => c.costiFatture + c.costiDiretti))
  const scelto = centri.find((c) => c.codice === aperto)

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Centri di costo</h3>
          <p className="text-sm text-gray-500">Tocca un servizio per vedere mese per mese e i fornitori.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filtroArea && (
            <button
              onClick={onTogliFiltro}
              className="flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: coloreArea(filtroArea) }} />
              {filtroArea} <span aria-hidden>×</span>
            </button>
          )}
          <div className="flex rounded-full bg-white p-1 shadow-sm ring-1 ring-gray-200">
            {(['costi', 'ore', 'nome'] as Ordine[]).map((o) => (
              <button
                key={o}
                onClick={() => setOrdine(o)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                  ordine === o ? 'bg-primary text-white shadow' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {o === 'nome' ? 'A–Z' : o}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {elenco.map((c, i) => (
          <Card
            key={c.codice}
            c={c}
            max={max}
            meseInizio={meseInizio}
            meseUltimo={meseUltimo}
            indice={i}
            onApri={() => setAperto(c.codice)}
          />
        ))}
      </div>

      {scelto && (
        <SchedaCentro c={scelto} meseInizio={meseInizio} meseUltimo={meseUltimo} esempio={esempio} onChiudi={() => setAperto(null)} />
      )}
    </section>
  )
}

function Card({
  c,
  max,
  meseInizio,
  meseUltimo,
  indice,
  onApri,
}: {
  c: CentroCruscotto
  max: number
  meseInizio: number
  meseUltimo: number
  indice: number
  onApri: () => void
}) {
  const montato = useMontato()
  const colore = coloreArea(c.area)
  const costi = c.costiFatture + c.costiDiretti
  const vuoto = costi === 0
  const budgetUsato = c.budget ? costi / c.budget : null
  // Budget: proporzione dell'anno trascorsa, per dire se si è "avanti" o no.
  const attesa = meseUltimo / 12

  return (
    <button
      onClick={onApri}
      className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{
        opacity: montato ? 1 : 0,
        transform: montato ? undefined : 'translateY(8px)',
        transition: `opacity 500ms ease ${Math.min(indice, 12) * 45}ms, transform 500ms ease ${Math.min(indice, 12) * 45}ms, box-shadow 300ms`,
      }}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: colore }} />
      <div className="flex items-center gap-2">
        <span
          className="rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold"
          style={{ background: `${colore}1f`, color: '#2b2a27' }}
        >
          {c.codice}
        </span>
        <span className="truncate text-xs text-gray-500">{c.area}</span>
      </div>
      <p className="mt-1.5 truncate font-semibold text-gray-900">{c.nome}</p>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className={`text-2xl font-bold tabular-nums tracking-tight ${vuoto ? 'text-gray-300' : 'text-gray-900'}`}>
            {euro(costi)}
          </p>
          <p className="text-[11px] text-gray-500">
            {vuoto ? 'nessun costo ancora attribuito' : 'costi'}
            {c.ricavi > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-emerald-700">ricavi {euroBreve(c.ricavi)}</span>
              </>
            )}
          </p>
        </div>
        <div className="w-24 shrink-0">
          <Linea valori={c.mensileCosti} meseDa={meseInizio} meseUltimo={meseUltimo} colore={colore} />
        </div>
      </div>

      {budgetUsato !== null ? (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-gray-500">
            <span>Budget {euroBreve(c.budget!)}</span>
            <span
              className={`font-semibold ${
                budgetUsato > 1 ? 'text-red-700' : budgetUsato > attesa + 0.08 ? 'text-amber-700' : 'text-gray-700'
              }`}
            >
              {budgetUsato > 1 ? '⚠ ' : ''}
              {numero(budgetUsato * 100)}% usato
            </span>
          </div>
          <div className="relative mt-1 h-1.5 rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full transition-[width] duration-1000"
              style={{
                width: montato ? `${Math.min(100, budgetUsato * 100)}%` : 0,
                background: budgetUsato > 1 ? '#d03b3b' : colore,
              }}
            />
            {/* dove dovrebbe essere a questo punto dell'anno */}
            <span className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-gray-800" style={{ left: `${attesa * 100}%` }} />
          </div>
        </div>
      ) : (
        <div className="mt-3 h-1.5 rounded-full bg-gray-100">
          <div
            className="h-1.5 rounded-full transition-[width] duration-1000"
            style={{ width: montato ? `${(costi / max) * 100}%` : 0, background: colore }}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-gray-600">
        {c.nFatture > 0 && <Chip>📄 {numero(c.nFatture)} fatture</Chip>}
        {c.nDiretti > 0 && <Chip>✍️ {numero(c.nDiretti)} a mano</Chip>}
        {c.ore > 0 && (
          <Chip>
            ⏱ {numero(c.ore)} h{c.persone ? ` · ${c.persone} pers.` : ''}
          </Chip>
        )}
        {c.saldoQonto !== null && <Chip>🏦 {euro(c.saldoQonto)}</Chip>}
      </div>
    </button>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-gray-50 px-2 py-0.5 ring-1 ring-gray-100">{children}</span>
}
