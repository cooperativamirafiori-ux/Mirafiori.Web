'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Banner } from '@/components/ui/Banner'
import { Modale } from '@/components/ui/Modale'
import { Vuoto } from '@/components/ui/Vuoto'
import { PARZIALI, type CruscottoStrutture as Dati, type Parziale, type SchedaStruttura } from '@/types/costi-strutture'
import { ETICHETTA_TIPO } from '@/types/utenze'
import { BarraParziali, Colonne, Legenda, MesiImpilati } from './grafici'
import { COLORE_TIPO, EMOJI_TIPO, MESI_LUNGHI, data, euro, numero } from './formato'

export function CruscottoStrutture({
  dati,
  anni,
  tutte,
  amministrazione,
}: {
  dati: Dati
  anni: number[]
  tutte: boolean
  amministrazione: boolean
}) {
  const [aperta, setAperta] = useState<SchedaStruttura | null>(null)
  const periodo =
    dati.meseLimite === 11
      ? `tutto il ${dati.anno}`
      : dati.meseLimite < 0
        ? `${dati.anno}`
        : `gennaio – ${MESI_LUNGHI[dati.meseLimite]} ${dati.anno}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold text-gray-800 mr-auto">Quanto costa ogni struttura</h2>
        {anni.length > 1 &&
          anni.map((a) => (
            <Link
              key={a}
              href={`?anno=${a}`}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${a === dati.anno ? 'bg-brand-cyan text-white border-brand-cyan' : 'border-gray-300 text-gray-600'}`}
            >
              {a}
            </Link>
          ))}
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">{tutte ? 'Tutte le strutture' : 'Le tue strutture'} · {periodo}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{euro(dati.totale)}</p>
        </div>
        <BarraParziali parziali={dati.parziali} altezza="h-4" />
        <Legenda parziali={dati.parziali} solo />
        <MesiImpilati perParziale={sommaMesi(dati.strutture)} limite={dati.meseLimite} />
      </section>

      {dati.avvisi.map((a) => (
        <Banner key={a} tono="avviso">{a}</Banner>
      ))}
      {tutte && dati.senzaStruttura.righe > 0 && (
        <Banner tono="info">
          {dati.senzaStruttura.righe === 1 ? "1 costo" : `${dati.senzaStruttura.righe} costi`} ({euro(dati.senzaStruttura.importo)}) in Costi Strutture senza struttura: stanno solo su un centro di costo e qui non compaiono.
        </Banner>
      )}

      {!dati.strutture.length && <Vuoto>Nessuna struttura da mostrare.</Vuoto>}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {dati.strutture.map((s) => (
          <button key={s.id} onClick={() => setAperta(s)} className="text-left bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:border-brand-cyan transition-all">
            <div className="flex items-start gap-2">
              <div className="min-w-0 mr-auto">
                <p className="text-[11px] font-semibold text-gray-400">{s.codice}{s.ccNome ? ` · ${s.ccNome}` : ''}</p>
                <p className="font-bold text-gray-800 leading-tight">{s.nome}</p>
              </div>
              <p className="font-bold text-gray-900 whitespace-nowrap">{euro(s.totale)}</p>
            </div>
            <div className="mt-3">
              <BarraParziali parziali={s.parziali} />
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {PARZIALI.filter((p) => s.parziali[p.chiave] !== 0).map((p) => (
                <li key={p.chiave} className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.colore }} />
                  <span className="truncate text-gray-600">{p.etichetta}</span>
                  <span className="ml-auto font-semibold text-gray-800">{euro(s.parziali[p.chiave])}</span>
                </li>
              ))}
            </ul>
            {s.avvisi.length > 0 && <p className="mt-2 text-xs text-amber-700">⚠ {s.avvisi.length} da guardare</p>}
          </button>
        ))}
      </section>

      {amministrazione && (
        <p className="text-xs text-gray-500">
          Le fonti: <Link className="underline" href="/amministrazione/utenze">Utenze</Link> (bollette dagli XML) ·{' '}
          <Link className="underline" href="/amministrazione/costi-fissi">Costi fissi</Link> · Costi Strutture (manutenzioni, pulizie, acquisti) ·
          Lavori Cura Ambienti.
        </p>
      )}

      {aperta && <SchedaDettaglio s={aperta} limite={dati.meseLimite} onChiudi={() => setAperta(null)} />}
    </div>
  )
}

function sommaMesi(strutture: SchedaStruttura[]): Record<Parziale, number[]> {
  const out = Object.fromEntries(PARZIALI.map((p) => [p.chiave, Array(12).fill(0)])) as Record<Parziale, number[]>
  for (const s of strutture) for (const p of PARZIALI) s.mesiPerParziale[p.chiave].forEach((v, m) => (out[p.chiave][m] += v))
  return out
}

function SchedaDettaglio({ s, limite, onChiudi }: { s: SchedaStruttura; limite: number; onChiudi: () => void }) {
  const [filtro, setFiltro] = useState<Parziale | 'tutti'>('tutti')
  const movimenti = useMemo(() => s.movimenti.filter((m) => filtro === 'tutti' || m.parziale === filtro), [s, filtro])
  const colore = new Map(PARZIALI.map((p) => [p.chiave, p.colore]))

  return (
    <Modale titolo={s.nome} sottotitolo={`${s.codice}${s.ccNome ? ` · ${s.ccNome}` : ''} · ${euro(s.totale)}`} onChiudi={onChiudi}>
      <div className="space-y-5">
        <MesiImpilati perParziale={s.mesiPerParziale} limite={limite} />

        <div className="space-y-1.5">
          {PARZIALI.map((p) => (
            <button
              key={p.chiave}
              onClick={() => setFiltro(filtro === p.chiave ? 'tutti' : p.chiave)}
              className={`w-full flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 ${filtro === p.chiave ? 'bg-gray-100' : ''}`}
              title={p.fonte}
            >
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.colore }} />
              <span className="text-gray-700">{p.etichetta}</span>
              <span className={`ml-auto font-semibold ${s.parziali[p.chiave] ? 'text-gray-900' : 'text-gray-300'}`}>{euro(s.parziali[p.chiave])}</span>
            </button>
          ))}
          <div className="flex items-center gap-2 text-sm px-2 pt-2 border-t border-gray-100">
            <span className="font-bold text-gray-800">Totale</span>
            <span className="ml-auto font-bold text-gray-900">{euro(s.totale)}</span>
          </div>
        </div>

        {s.utenze.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Consumi</p>
            {s.utenze.map((u) => (
              <div key={u.tipo} className="rounded-xl bg-gray-50 p-3">
                <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  <span className="font-semibold text-gray-800">{EMOJI_TIPO[u.tipo]} {ETICHETTA_TIPO[u.tipo]}</span>
                  <span className="text-gray-600">{numero(u.consumo)} {u.unita}</span>
                  <span className="text-gray-600">{euro(u.importo)}</span>
                  {u.costoUnitario != null && <span className="ml-auto text-gray-500">{numero(u.costoUnitario, 3)} €/{u.unita}</span>}
                </div>
                <div className="mt-2">
                  <Colonne valori={u.mesiConsumo} colore={COLORE_TIPO[u.tipo]} unita={u.unita} />
                </div>
              </div>
            ))}
          </div>
        )}

        {s.avvisi.map((a) => (
          <Banner key={a} tono="avviso">{a}</Banner>
        ))}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Movimenti {filtro !== 'tutti' ? `· ${PARZIALI.find((p) => p.chiave === filtro)?.etichetta}` : ''} ({movimenti.length})
          </p>
          {!movimenti.length && <Vuoto>Niente in questo periodo.</Vuoto>}
          <ul className="divide-y divide-gray-100">
            {movimenti.map((m, i) => (
              <li key={i} className="py-2 flex gap-2 text-sm">
                <span className="mt-1.5 w-2 h-2 rounded-sm shrink-0" style={{ background: colore.get(m.parziale) }} />
                <div className="min-w-0 flex-1">
                  <p className="text-gray-800 break-words">{m.descrizione || m.sotto}</p>
                  <p className="text-xs text-gray-500">
                    {data(m.data)}{m.sotto ? ` · ${m.sotto}` : ''}
                    {m.link && (
                      <>
                        {' · '}
                        <a href={m.link} target="_blank" rel="noreferrer" className="underline">PDF</a>
                      </>
                    )}
                  </p>
                </div>
                <span className="font-semibold text-gray-900 whitespace-nowrap">{euro(m.importo, 2)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modale>
  )
}
