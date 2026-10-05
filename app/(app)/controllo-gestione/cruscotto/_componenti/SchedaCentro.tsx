'use client'

/**
 * Il dettaglio di un centro di costo, dentro il Modale del kit (foglio dal
 * basso su telefono): mese per mese, chi sono i fornitori, le ultime righe.
 */

import Link from 'next/link'
import { Modale } from '@/components/ui/Modale'
import type { CentroCruscotto } from '@/types/cruscotto'
import { BarreMesi } from './grafici'
import { coloreArea, dataBreve, euro, numero } from './formato'

const ETICHETTA_FONTE = {
  fattura: { testo: 'Fattura', cls: 'bg-slate-100 text-slate-700' },
  diretto: { testo: 'A mano', cls: 'bg-amber-100 text-amber-800' },
  ricavo: { testo: 'Ricavo', cls: 'bg-emerald-100 text-emerald-800' },
} as const

export function SchedaCentro({
  c,
  meseInizio,
  meseUltimo,
  esempio,
  onChiudi,
}: {
  c: CentroCruscotto
  meseInizio: number
  meseUltimo: number
  esempio: boolean
  onChiudi: () => void
}) {
  const colore = coloreArea(c.area)
  const costi = c.costiFatture + c.costiDiretti
  const maxF = Math.max(1, ...c.fornitori.map((f) => f.importo))
  const conRicavi = c.ricavi > 0

  return (
    <Modale
      titolo={c.nome}
      sottotitolo={`${c.codice} · ${c.area}`}
      onChiudi={onChiudi}
      azioni={
        <div className="flex w-full flex-wrap gap-2">
          {!esempio && (
            <Link
              href="/controllo-gestione/fatture"
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Segna fatture del servizio
            </Link>
          )}
          <button
            onClick={onChiudi}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Chiudi
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Mini etichetta="Costi" valore={euro(costi)} />
        <Mini etichetta="Ricavi" valore={conRicavi ? euro(c.ricavi) : '—'} />
        <Mini etichetta="Ore" valore={c.ore ? numero(c.ore) : '—'} />
      </div>

      {conRicavi && (
        <div
          className={`mt-2 rounded-xl px-3 py-2 text-sm font-semibold ${
            c.ricavi - costi >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {c.ricavi - costi >= 0 ? '▲' : '▼'} Saldo {euro(c.ricavi - costi)}
          <span className="font-normal opacity-80"> · ricavi meno costi registrati, senza il costo del lavoro</span>
        </div>
      )}

      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wider text-gray-500">Mese per mese</h4>
      <div className="mt-2">
        <BarreMesi
          meseDa={meseInizio}
          meseUltimo={meseUltimo}
          serie={[
            { nome: 'Costi', valori: c.mensileCosti, colore },
            ...(conRicavi ? [{ nome: 'Ricavi', valori: c.mensileRicavi, colore: '#9a9994' }] : []),
          ]}
        />
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colore }} /> Costi
        </span>
        {conRicavi && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#9a9994]" /> Ricavi
          </span>
        )}
      </div>

      {c.fornitori.length > 0 && (
        <>
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wider text-gray-500">Dove si spende</h4>
          <ul className="mt-2 space-y-2">
            {c.fornitori.map((f) => (
              <li key={f.nome}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-gray-700">{f.nome}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-gray-900">{euro(f.importo)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full" style={{ width: `${(f.importo / maxF) * 100}%`, background: colore }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {c.ultime.length > 0 && (
        <>
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wider text-gray-500">Ultime registrazioni</h4>
          <ul className="mt-2 divide-y divide-gray-100">
            {c.ultime.map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-16 shrink-0 text-xs tabular-nums text-gray-500">{dataBreve(r.data)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-gray-800">{r.chi}</span>
                  <span className={`mt-0.5 inline-block rounded-full px-1.5 text-[10px] font-semibold ${ETICHETTA_FONTE[r.fonte].cls}`}>
                    {ETICHETTA_FONTE[r.fonte].testo}
                    {r.numero ? ` · n. ${r.numero}` : ''}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-gray-900">{euro(r.importo)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {costi === 0 && !conRicavi && (
        <p className="mt-5 rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-500">
          Ancora nessuna fattura segnata su questo servizio.
        </p>
      )}
    </Modale>
  )
}

function Mini({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2">
      <p className="text-[11px] text-gray-500">{etichetta}</p>
      <p className="truncate text-sm font-bold tabular-nums text-gray-900">{valore}</p>
    </div>
  )
}
