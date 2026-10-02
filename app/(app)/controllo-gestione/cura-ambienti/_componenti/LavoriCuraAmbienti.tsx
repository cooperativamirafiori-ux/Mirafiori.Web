'use client'

/**
 * Elenco dei lavori del mese con, in testa, il confronto che tiene onesti i
 * consuntivi: ore timbrate su Cura Ambienti contro ore consuntivate.
 *
 * Righe impilate (niente tabelle): i coordinatori lo usano dal telefono.
 */

import { useCallback, useEffect, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Kpi } from '@/components/ui/Kpi'
import { Pill } from '@/components/ui/Pill'
import { Vuoto } from '@/components/ui/Vuoto'
import {
  STATI_LAVORO,
  type LavoroConImporti,
  type RiepilogoMese,
  type StrutturaScelta,
} from '@/types/cura-ambienti'
import { euro, meseCorrente, nomeMese, ore, spostaMese } from './formato'
import { SchedaLavoro } from './SchedaLavoro'

interface Dati {
  lavori: LavoroConImporti[]
  riepilogo: RiepilogoMese
  strutture: StrutturaScelta[]
}

export function LavoriCuraAmbienti() {
  const [mese, setMese] = useState(meseCorrente())
  const [dati, setDati] = useState<Dati | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [aperto, setAperto] = useState<LavoroConImporti | 'nuovo' | null>(null)
  const [preparo, setPreparo] = useState(false)

  const carica = useCallback(async () => {
    setCaricamento(true)
    setErrore('')
    try {
      const res = await fetch(`/api/cura-ambienti/lavori?mese=${mese.slice(0, 7)}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Errore di lettura')
      setDati(j)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di lettura')
    } finally {
      setCaricamento(false)
    }
  }, [mese])

  useEffect(() => {
    void carica()
  }, [carica])

  async function preparaMese() {
    setPreparo(true)
    setErrore('')
    setMessaggio('')
    try {
      const res = await fetch('/api/cura-ambienti/prepara-mese', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mese }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Operazione non riuscita')
      setMessaggio(
        j.creati === 0 && j.giaPresenti === 0
          ? `Nel mese prima non ci sono lavori ricorrenti da copiare.`
          : `Copiati ${j.creati} lavori ricorrenti${j.giaPresenti ? ` (${j.giaPresenti} c'erano già)` : ''}.`,
      )
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione non riuscita')
    } finally {
      setPreparo(false)
    }
  }

  const r = dati?.riepilogo
  const scoperte = r ? Math.round((r.oreTimbrate - r.oreConsuntivate) * 100) / 100 : 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setMese(spostaMese(mese, -1))}
          className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-gray-700"
          aria-label="Mese precedente"
        >
          ←
        </button>
        <h2 className="text-lg font-bold text-gray-800 capitalize text-center">{nomeMese(mese)}</h2>
        <button
          onClick={() => setMese(spostaMese(mese, 1))}
          className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-gray-700"
          aria-label="Mese successivo"
        >
          →
        </button>
      </div>

      {r && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi titolo="Ore timbrate" valore={ore(r.oreTimbrate)} accento="slate" />
          <Kpi titolo="Ore consuntivate" valore={ore(r.oreConsuntivate)} accento="emerald" />
          <Kpi titolo="Ore non addebitate" valore={ore(scoperte)} accento={scoperte < 0 ? 'red' : 'amber'} />
          <Kpi titolo="Addebitabile" valore={euro(r.importoConsuntivato)} accento="violet" />
        </section>
      )}

      {r && scoperte < 0 && (
        <Banner tono="avviso">
          I consuntivi sommano più ore di quelle timbrate su Cura Ambienti ({ore(r.oreConsuntivate)} contro{' '}
          {ore(r.oreTimbrate)}): qualche consuntivo è da rivedere.
        </Banner>
      )}
      {r && (r.tariffe.pulizie === null || r.tariffe.manutenzione === null) && (
        <Banner tono="avviso">Per questo mese manca una tariffa oraria: gli importi non si possono calcolare.</Banner>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setAperto('nuovo')}
          className="px-4 py-2.5 rounded-xl bg-primary text-white font-semibold"
        >
          + Nuovo lavoro
        </button>
        <button
          onClick={preparaMese}
          disabled={preparo}
          className="px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 font-semibold disabled:opacity-50"
        >
          {preparo ? 'Preparo…' : 'Copia i ricorrenti del mese prima'}
        </button>
      </div>

      <Banner tono="errore">{errore}</Banner>
      <Banner tono="ok">{messaggio}</Banner>

      {!caricamento && dati && dati.lavori.length === 0 && (
        <Vuoto>
          Nessun lavoro in {nomeMese(mese)}. Crea il primo, oppure copia le pulizie ricorrenti del mese prima.
        </Vuoto>
      )}

      <ul className="space-y-3">
        {dati?.lavori.map((l) => {
          const s = STATI_LAVORO[l.stato]
          const chiuso = l.stato === 'consuntivato' || l.stato === 'addebitato'
          return (
            <li key={l.id}>
              <button
                onClick={() => setAperto(l)}
                className={`w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition ${
                  l.stato === 'annullato' ? 'opacity-60' : ''
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-400">#{l.numero}</span>
                  <Pill text={s.etichetta} tono={s.tono} />
                  {l.ricorrente && <Pill text="Ricorrente" tono="neutro" />}
                </div>
                <p className="mt-1.5 font-semibold text-gray-800">{l.titolo}</p>
                <p className="text-sm text-gray-500">
                  {l.destinatario === 'struttura'
                    ? `${l.strutturaNome ?? l.strutturaCodice} · ${l.ccCodice}`
                    : `Cliente esterno: ${l.cliente}`}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="text-gray-600">
                    Preventivo <b>{euro(l.importi.preventivo)}</b>
                  </span>
                  {chiuso || l.importi.consuntivo !== null ? (
                    <span className="text-gray-600">
                      Consuntivo <b>{euro(l.importi.consuntivo)}</b>
                      {l.importi.scostamento !== null && l.importi.scostamento !== 0 && (
                        <span className={l.importi.scostamento > 0 ? 'text-red-600' : 'text-emerald-600'}>
                          {' '}
                          ({l.importi.scostamento > 0 ? '+' : ''}
                          {euro(l.importi.scostamento)})
                        </span>
                      )}
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {aperto && dati && (
        <SchedaLavoro
          lavoro={aperto === 'nuovo' ? null : aperto}
          mese={mese}
          strutture={dati.strutture}
          tariffe={dati.riepilogo.tariffe}
          onChiudi={() => setAperto(null)}
          onSalvato={async (testo) => {
            setAperto(null)
            setMessaggio(testo)
            await carica()
          }}
        />
      )}
    </div>
  )
}
