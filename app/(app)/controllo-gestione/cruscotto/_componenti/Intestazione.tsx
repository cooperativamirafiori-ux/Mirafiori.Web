'use client'

/**
 * La testata del cruscotto: il numero che conta, quanta parte delle fatture ha
 * già un servizio, e l'andamento dell'anno. Fondo scuro di proposito: è la sola
 * cosa della pagina che si guarda prima di leggere.
 */

import Link from 'next/link'
import type { DatiCruscotto } from '@/types/cruscotto'
import { Anello, AreaMesi } from './grafici'
import { MESI_LUNGHI, euro, numero, useConta } from './formato'

export function Intestazione({ dati, costi }: { dati: DatiCruscotto; costi: number }) {
  const { fatture, anno, anni, esempio, completo, meseInizio, meseUltimo } = dati
  const periodo =
    meseInizio === meseUltimo
      ? MESI_LUNGHI[meseUltimo - 1].toLowerCase()
      : `da ${MESI_LUNGHI[meseInizio - 1].toLowerCase()} a ${MESI_LUNGHI[meseUltimo - 1].toLowerCase()}`
  const quota = fatture.tutte > 0 ? fatture.attribuite / fatture.tutte : 0
  const conta = useConta(costi)
  const pct = useConta(quota * 100, 1600)
  const link = (a: number, e: boolean) => `?anno=${a}${e ? '&esempio=1' : ''}`
  const mensileCentri = Array.from({ length: 12 }, (_, i) =>
    dati.centri.reduce((s, c) => s + (c.mensileCosti[i] ?? 0), 0),
  )

  return (
    <section className="relative overflow-hidden rounded-3xl bg-[#0b1f5c] text-white shadow-xl shadow-primary/20">
      {/* luci di fondo */}
      <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-brand-cyan/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-primary/70 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-1/3 h-40 w-40 rounded-full bg-brand-orange/25 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      />

      <div className="relative p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-white/10 p-1 ring-1 ring-white/15 backdrop-blur">
            {anni.map((a) => (
              <Link
                key={a}
                href={link(a, esempio)}
                className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                  a === anno ? 'bg-white text-[#0b1f5c] shadow' : 'text-white/75 hover:text-white'
                }`}
              >
                {a}
              </Link>
            ))}
          </div>
          {completo && (
            <div className="flex rounded-full bg-white/10 p-1 ring-1 ring-white/15 backdrop-blur">
              <Link
                href={link(anno, false)}
                className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                  !esempio ? 'bg-white text-[#0b1f5c] shadow' : 'text-white/75 hover:text-white'
                }`}
              >
                Dati veri
              </Link>
              <Link
                href={link(anno, true)}
                className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                  esempio ? 'bg-brand-orange text-white shadow' : 'text-white/75 hover:text-white'
                }`}
              >
                Esempio
              </Link>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-cyan-light">
              Costi dei servizi · {anno}
            </p>
            <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight sm:text-6xl">{euro(conta)}</p>
            <p className="mt-2 max-w-md text-sm text-white/70">
              {completo ? (
                <>
                  Attribuiti a un centro di costo, IVA esclusa, {periodo}. Le fatture arrivate in tutto sono{' '}
                  <span className="font-semibold text-white">{euro(fatture.tutte)}</span>
                  {!esempio && ' (solo fatture elettroniche XML)'}.
                </>
              ) : (
                <>Dei tuoi servizi, IVA esclusa, {periodo}.</>
              )}
            </p>
          </div>

          {completo && (
            <div className="flex items-center gap-4">
              <Anello quota={quota} colore={quota >= 0.8 ? '#5be3a6' : quota >= 0.4 ? '#FFBF00' : '#4FB9D6'}>
                <span className="text-3xl font-bold tabular-nums">{numero(pct)}%</span>
                <span className="text-[10px] uppercase tracking-wider text-white/60">attribuito</span>
              </Anello>
              <p className="max-w-[11rem] text-sm text-white/70">
                <span className="font-semibold text-white">{numero(fatture.nAttribuite)}</span> fatture su{' '}
                {numero(fatture.nTutte)} hanno già un servizio.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6">
          <AreaMesi
            scuro
            meseDa={meseInizio}
            meseUltimo={meseUltimo}
            serie={
              completo
                ? [
                    { nome: 'Fatture arrivate', valori: fatture.mensileTutte, colore: '#A3DAEA', riempi: 0.18 },
                    { nome: 'Attribuite', valori: mensileCentri, colore: '#EF7A4A', riempi: 0.45 },
                  ]
                : [{ nome: 'Costi', valori: mensileCentri, colore: '#EF7A4A', riempi: 0.45 }]
            }
          />
          {completo && (
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-white/70">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-[#A3DAEA]" /> Fatture arrivate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-[#EF7A4A]" /> Costi attribuiti ai servizi
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
