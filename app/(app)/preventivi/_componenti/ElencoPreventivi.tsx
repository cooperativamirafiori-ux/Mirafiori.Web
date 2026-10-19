'use client'

/**
 * Elenco dei preventivi, a schede impilate (si usa dal telefono).
 *
 * Le schede in alto filtrano per stato. "In attesa" è quella che conta: sono i
 * preventivi partiti senza esito, quelli che Andrea oggi rincorre al telefono.
 * Da più di GIORNI_SOLLECITO giorni compaiono in ambra.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Kpi } from '@/components/ui/Kpi'
import { Pill } from '@/components/ui/Pill'
import { Vuoto } from '@/components/ui/Vuoto'
import { inputCls } from '@/components/ui/Campo'
import { MODELLI, STATI_PREVENTIVO, type Preventivo, type StatoPreventivo } from '@/types/preventivi'
import { aggiungiGiorni, dataIt, euro, oggiIso } from '@/lib/preventivi/calcoli'
import { GIORNI_SOLLECITO } from '@/lib/preventivi/flusso'

const SCHEDE: { valore: '' | StatoPreventivo; etichetta: string }[] = [
  { valore: '', etichetta: 'Aperti' },
  { valore: 'bozza', etichetta: 'Bozze' },
  { valore: 'emesso', etichetta: 'In attesa' },
  { valore: 'accettato', etichetta: 'Accettati' },
  { valore: 'rifiutato', etichetta: 'Rifiutati' },
  { valore: 'annullato', etichetta: 'Annullati' },
]

export function ElencoPreventivi({ statoIniziale, tutti }: { statoIniziale: string; tutti: boolean }) {
  const [preventivi, setPreventivi] = useState<Preventivo[] | null>(null)
  const [errore, setErrore] = useState('')
  const [scheda, setScheda] = useState<'' | StatoPreventivo>(
    (SCHEDE.find((s) => s.valore === statoIniziale)?.valore ?? '') as '' | StatoPreventivo,
  )
  const [cerca, setCerca] = useState('')

  useEffect(() => {
    fetch('/api/preventivi')
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Errore di lettura')
        setPreventivi(j.preventivi)
      })
      .catch((e) => setErrore(e instanceof Error ? e.message : 'Errore di lettura'))
  }, [])

  const soglia = aggiungiGiorni(oggiIso(), -GIORNI_SOLLECITO)
  const conteggi = useMemo(() => {
    const c = { bozza: 0, emesso: 0, accettato: 0, ritardo: 0 }
    const anno = oggiIso().slice(0, 4)
    for (const p of preventivi ?? []) {
      if (p.stato === 'bozza') c.bozza++
      if (p.stato === 'emesso') {
        c.emesso++
        if (p.emessoIl && p.emessoIl <= soglia) c.ritardo++
      }
      if (p.stato === 'accettato' && (p.esitoIl ?? '').startsWith(anno)) c.accettato++
    }
    return c
  }, [preventivi, soglia])

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    return (preventivi ?? [])
      .filter((p) => (scheda ? p.stato === scheda : p.stato === 'bozza' || p.stato === 'emesso'))
      .filter(
        (p) =>
          !q ||
          [p.numero, p.beneficiario, p.destinatario.ente, p.destinatario.nome, p.ccNome, p.tipoProgetto, p.oggetto]
            .join(' ')
            .toLowerCase()
            .includes(q),
      )
  }, [preventivi, scheda, cerca])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Link href="/preventivi/nuovo" className="grow sm:grow-0 text-center px-4 py-2.5 rounded-xl bg-primary text-white font-semibold">
          + Nuovo preventivo
        </Link>
        <Link
          href="/preventivi/tariffario"
          className="grow sm:grow-0 text-center px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 font-semibold"
        >
          {tutti ? 'Tariffario e ISTAT' : 'Tariffario'}
        </Link>
      </div>

      <Banner tono="errore">{errore}</Banner>

      {preventivi && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi titolo="Bozze" valore={conteggi.bozza} accento="slate" />
          <Kpi titolo="In attesa" valore={conteggi.emesso} accento="amber" />
          <Kpi titolo={`In attesa da più di ${GIORNI_SOLLECITO} giorni`} valore={conteggi.ritardo} accento={conteggi.ritardo ? 'red' : 'slate'} />
          <Kpi titolo="Accettati quest'anno" valore={conteggi.accettato} accento="emerald" />
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {SCHEDE.map((s) => (
          <button
            key={s.valore || 'aperti'}
            onClick={() => setScheda(s.valore)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
              scheda === s.valore ? 'bg-brand-cyan-dark text-white border-brand-cyan-dark' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {s.etichetta}
          </button>
        ))}
      </div>
      <input
        className={inputCls}
        placeholder="Cerca per protocollo, ragazzo, ente, servizio…"
        value={cerca}
        onChange={(e) => setCerca(e.target.value)}
      />

      {!preventivi && !errore && <p className="text-sm text-gray-500">Carico…</p>}
      {preventivi && !visibili.length && (
        <Vuoto>{cerca ? 'Nessun preventivo corrisponde alla ricerca.' : 'Qui non c’è niente.'}</Vuoto>
      )}

      <ul className="space-y-2">
        {visibili.map((p) => {
          const st = STATI_PREVENTIVO[p.stato]
          const inRitardo = p.stato === 'emesso' && p.emessoIl && p.emessoIl <= soglia
          return (
            <li key={p.spItemId}>
              <Link
                href={`/preventivi/${p.spItemId}`}
                className={`block bg-white rounded-xl border p-3 hover:border-brand-cyan ${inRitardo ? 'border-amber-300' : 'border-gray-100'}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Pill text={st.etichetta} tono={st.tono} />
                  <span className="font-mono text-sm font-semibold text-gray-700">{p.numero || 'senza protocollo'}</span>
                  {p.revisione > 1 && <span className="text-xs text-gray-500">rev. {p.revisione}</span>}
                  <span className="ml-auto text-sm font-semibold text-gray-800">{euro(p.totaleMensile)}/mese</span>
                </div>
                <p className="mt-1.5 font-semibold text-gray-800">
                  {p.beneficiario || 'Senza beneficiario'} <span className="font-normal text-gray-500">· {p.destinatario.ente || 'ente da indicare'}</span>
                </p>
                <p className="text-sm text-gray-600">
                  {p.tipoProgetto || MODELLI[p.modello]} · {p.ccNome || p.ccCodice}
                  {p.dal && p.al ? ` · ${dataIt(p.dal)} – ${dataIt(p.al)}` : ''}
                </p>
                {p.stato === 'emesso' && (
                  <p className={`text-xs mt-1 ${inRitardo ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>
                    Inviato il {dataIt(p.emessoIl)} — segna l’esito quando arriva
                  </p>
                )}
                {(p.stato === 'accettato' || p.stato === 'rifiutato') && (
                  <p className="text-xs mt-1 text-gray-500">
                    {st.etichetta} il {dataIt(p.esitoIl)}
                    {p.esitoDa ? ` · ${p.esitoDa}` : ''}
                  </p>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
