'use client'

/**
 * Cruscotto del controllo di gestione — prima versione, per capire come può
 * funzionare. Riceve tutto già calcolato dal server: qui solo filtri,
 * ordinamenti e disegno.
 */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import type { DatiCruscotto } from '@/types/cruscotto'
import { Intestazione } from './Intestazione'
import { Centri } from './Centri'
import { ORDINE_AREE, coloreArea, euro, euroBreve, gruppoArea, numero, useConta, useMontato } from './formato'

export function Cruscotto({ dati }: { dati: DatiCruscotto }) {
  const [filtroArea, setFiltroArea] = useState<string | null>(null)

  const tot = useMemo(() => {
    let costi = 0
    let diretti = 0
    let ricavi = 0
    let ore = 0
    let budget = 0
    for (const c of dati.centri) {
      costi += c.costiFatture + c.costiDiretti
      diretti += c.costiDiretti
      ricavi += c.ricavi
      ore += c.ore
      budget += c.budget ?? 0
    }
    return { costi, diretti, ricavi, ore, budget }
  }, [dati.centri])

  const aree = useMemo(() => {
    const m = new Map<string, { nome: string; costi: number; centri: number }>()
    for (const c of dati.centri) {
      const g = gruppoArea(c.area)
      const a = m.get(g) ?? { nome: g, costi: 0, centri: 0 }
      a.costi += c.costiFatture + c.costiDiretti
      a.centri += 1
      m.set(g, a)
    }
    return ORDINE_AREE.map((n) => m.get(n)).filter((a): a is NonNullable<typeof a> => Boolean(a))
  }, [dati.centri])

  return (
    <div className="space-y-6">
      {dati.esempio && (
        <div className="sticky top-2 z-20 flex items-center gap-3 rounded-2xl bg-brand-orange px-4 py-3 text-sm font-semibold text-white shadow-lg">
          <span className="text-lg" aria-hidden>🧪</span>
          <span className="flex-1">
            Dati di esempio, inventati<span className="hidden sm:inline">: servono a vedere come funzionerà il cruscotto quando le fonti saranno piene</span>.
          </span>
          <Link href={`?anno=${dati.anno}`} className="shrink-0 rounded-full bg-white/20 px-3 py-1 hover:bg-white/30">
            Dati veri
          </Link>
        </div>
      )}

      {dati.avvisi.length > 0 && (
        <Banner tono="avviso">
          Non hanno risposto: {dati.avvisi.join(', ')}. I numeri qui sotto non le contano.
        </Banner>
      )}

      <Intestazione dati={dati} costi={tot.costi} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {dati.esempio ? (
          <>
            <Tessera icona="💶" etichetta="Ricavi" valore={tot.ricavi} formato={euroBreve} />
            <Tessera
              icona={tot.ricavi - tot.costi >= 0 ? '📈' : '📉'}
              etichetta="Ricavi meno costi"
              valore={tot.ricavi - tot.costi}
              formato={euroBreve}
              tono={tot.ricavi - tot.costi >= 0 ? 'verde' : 'rosso'}
            />
            <Tessera
              icona="🎯"
              etichetta={`Budget usato (anno al ${numero((dati.meseUltimo / 12) * 100)}%)`}
              valore={tot.budget ? (tot.costi / tot.budget) * 100 : 0}
              formato={(v) => `${numero(v)}%`}
            />
            <Tessera icona="⏱" etichetta="Ore lavorate" valore={tot.ore} formato={(v) => numero(v)} />
          </>
        ) : (
          <>
            <Tessera
              icona="📄"
              etichetta="Fatture con servizio"
              valore={dati.fatture.nAttribuite}
              formato={(v) => numero(v)}
              nota={dati.completo ? `su ${numero(dati.fatture.nTutte)} arrivate` : undefined}
            />
            <Tessera
              icona="🧾"
              etichetta="Da attribuire"
              valore={dati.daAttribuire.importo}
              formato={euroBreve}
              nota={`${numero(dati.daAttribuire.n)} fatture senza servizio`}
            />
            <Tessera icona="💶" etichetta="Fatture emesse" valore={tot.ricavi} formato={euroBreve} nota="da Richiesta fattura" />
            <Tessera icona="⏱" etichetta="Ore lavorate" valore={tot.ore} formato={(v) => numero(v)} nota="dalle timbrature" />
          </>
        )}
      </section>

      {dati.completo && aree.length > 1 && (
        <Aree aree={aree} totale={tot.costi} filtro={filtroArea} onFiltro={setFiltroArea} />
      )}

      <Centri
        centri={dati.centri}
        meseInizio={dati.meseInizio}
        meseUltimo={dati.meseUltimo}
        esempio={dati.esempio}
        filtroArea={filtroArea}
        onTogliFiltro={() => setFiltroArea(null)}
      />

      {dati.completo && dati.daAttribuire.n > 0 && <DaAttribuire dati={dati} />}

      <Fonti esempio={dati.esempio} ricaviNo={dati.ricaviNonRiconosciuti} />
    </div>
  )
}

// --------------------------------------------------------------- tessere

function Tessera({
  icona,
  etichetta,
  valore,
  formato,
  nota,
  tono,
}: {
  icona: string
  etichetta: string
  valore: number
  formato: (v: number) => string
  nota?: string
  tono?: 'verde' | 'rosso'
}) {
  const v = useConta(valore)
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-lg" aria-hidden>
        {icona}
      </div>
      <p
        className={`mt-3 text-xl font-bold tabular-nums tracking-tight sm:text-2xl ${
          tono === 'verde' ? 'text-emerald-700' : tono === 'rosso' ? 'text-red-700' : 'text-gray-900'
        }`}
      >
        {formato(v)}
      </p>
      <p className="text-xs font-medium text-gray-600">{etichetta}</p>
      {nota && <p className="text-[11px] text-gray-400">{nota}</p>}
    </div>
  )
}

// ------------------------------------------------------------------ aree

function Aree({
  aree,
  totale,
  filtro,
  onFiltro,
}: {
  aree: Array<{ nome: string; costi: number; centri: number }>
  totale: number
  filtro: string | null
  onFiltro: (a: string | null) => void
}) {
  const montato = useMontato()
  const conCosti = aree.filter((a) => a.costi > 0)
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-bold text-gray-900">Per area</h3>
        <p className="text-xs text-gray-500">tocca un&apos;area per filtrare i servizi</p>
      </div>

      {/* barra unica: ogni area è un segmento, staccato dagli altri da 2px */}
      <div className="mt-4 flex h-4 w-full gap-[2px] overflow-hidden rounded-full bg-gray-100">
        {conCosti.map((a) => (
          <button
            key={a.nome}
            onClick={() => onFiltro(filtro === a.nome ? null : a.nome)}
            title={`${a.nome}: ${euro(a.costi)}`}
            className="h-full transition-all duration-1000 first:rounded-l-full last:rounded-r-full hover:brightness-110"
            style={{
              width: montato && totale > 0 ? `${(a.costi / totale) * 100}%` : '0%',
              background: coloreArea(a.nome),
              opacity: filtro && filtro !== a.nome ? 0.25 : 1,
            }}
          />
        ))}
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {aree.map((a) => {
          const attivo = filtro === a.nome
          return (
            <li key={a.nome}>
              <button
                onClick={() => onFiltro(attivo ? null : a.nome)}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition ${
                  attivo ? 'bg-gray-100' : 'hover:bg-gray-50'
                } ${filtro && !attivo ? 'opacity-50' : ''}`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: coloreArea(a.nome) }} />
                <span className="min-w-0 flex-1 truncate text-gray-800">
                  {a.nome} <span className="text-xs text-gray-400">· {a.centri}</span>
                </span>
                <span className="font-semibold tabular-nums text-gray-900">{euro(a.costi)}</span>
                <span className="w-10 text-right text-xs tabular-nums text-gray-500">
                  {totale > 0 ? `${Math.round((a.costi / totale) * 100)}%` : '—'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// -------------------------------------------------------- da attribuire

function DaAttribuire({ dati }: { dati: DatiCruscotto }) {
  const { daAttribuire, fatture } = dati
  const v = useConta(daAttribuire.importo)
  const max = Math.max(1, ...daAttribuire.fornitori.map((f) => f.importo))
  const quota = fatture.tutte > 0 ? daAttribuire.importo / fatture.tutte : 0
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-5 ring-1 ring-amber-200/70 sm:p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-orange/20 blur-2xl" />
      <div className="relative grid gap-5 sm:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">Da attribuire</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{euro(v)}</p>
          <p className="mt-1 text-sm text-gray-700">
            in {numero(daAttribuire.n)} fatture senza servizio — il {Math.round(quota * 100)}% di quello che è
            arrivato. Finché restano qui, il cruscotto vede solo una parte dei costi.
          </p>
          {!dati.esempio && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/controllo-gestione/fatture"
                className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-black"
              >
                Segna le fatture dei servizi →
              </Link>
              <Link
                href={`?anno=${dati.anno}&esempio=1`}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 ring-1 ring-amber-200 hover:bg-amber-50"
              >
                Come sarà a regime
              </Link>
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-600">I fornitori che pesano di più</p>
          <ul className="mt-2 space-y-2.5">
            {daAttribuire.fornitori.map((f) => (
              <li key={f.nome}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-gray-800">
                    {f.nome} <span className="text-xs text-gray-500">· {f.n}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-gray-900">{euro(f.importo)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/70">
                  <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${(f.importo / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-gray-500">
            Un fornitore che lavora sempre per lo stesso servizio si potrà attribuire in automatico: è il
            prossimo passo del piano.
          </p>
        </div>
      </div>
    </section>
  )
}

// ----------------------------------------------------------------- fonti

function Fonti({ esempio, ricaviNo }: { esempio: boolean; ricaviNo: { importo: number; n: number } }) {
  return (
    <details className="group rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600">
      <summary className="cursor-pointer list-none font-semibold text-gray-800">
        <span className="mr-2 inline-block transition group-open:rotate-90">›</span>
        Da dove vengono questi numeri
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>
          <b>Costi</b>: solo le <b>fatture elettroniche</b> arrivate come XML dallo SDI (da luglio 2026) e
          segnate su un servizio, da Flussi fatture o da Fatture del servizio. Importi <b>IVA esclusa</b>
          (imponibile), alla data della fattura.
        </li>
        <li>
          Le fatture più vecchie, entrate dall&apos;Excel dello scadenzario, restano fuori: non hanno
          l&apos;imponibile. I costi inseriti a mano in Manutenzioni non si contano: la fattura del fornitore
          arriva comunque come XML, e sarebbero doppioni.
        </li>
        <li>
          <b>Ricavi</b>: solo le fatture passate da Richiesta fattura, IVA esclusa, riconosciute dal nome del servizio
          {ricaviNo.n > 0 && ` (${ricaviNo.n} per ${euro(ricaviNo.importo)} con un nome che non corrisponde)`}.
          Mancano i contratti fatturati direttamente dall&apos;amministrazione.
        </li>
        <li>
          <b>Ore</b>: le ore di lavoro timbrate sull&apos;app. Il <b>costo del lavoro</b> non c&apos;è ancora:
          arriverà moltiplicando queste ore per il costo orario dal file paghe.
        </li>
        <li>Budget: non esiste ancora{esempio ? ', nell’esempio è inventato' : ''}.</li>
      </ul>
    </details>
  )
}
