'use client'

/**
 * Ore per progetto su un periodo.
 *
 * La domanda a cui risponde: «quante ore sono andate su questo bando, e chi le
 * ha fatte». Un elenco, non un cruscotto: il totale in cima, i progetti in
 * ordine di ore, lo spaccato per persona a richiesta.
 *
 * Il periodo e' libero (non solo il mese) perche' i bandi non seguono il
 * calendario delle paghe: si rendiconta dal primo giorno del progetto alla
 * scadenza, e quelle due date le sa solo chi rendiconta.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { Vuoto } from '@/components/ui/Vuoto'
import { Kpi } from '@/components/ui/Kpi'
import { oreLabel } from '@/app/(app)/timbrature/_componenti/mese'
import type { OrePerProgetto } from '@/types/timbrature'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function OreProgetti({ hr }: { hr: boolean }) {
  const oggi = new Date()
  const [dal, setDal] = useState(ymd(new Date(oggi.getFullYear(), 0, 1)))
  const [al, setAl] = useState(ymd(oggi))
  const [righe, setRighe] = useState<OrePerProgetto[]>([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')
  const [aperto, setAperto] = useState<number | null>(null)

  const carica = useCallback(async () => {
    setLoading(true)
    setErrore('')
    try {
      const r = await fetch(`/api/timbrature/hr/progetti?dal=${dal}&al=${al}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      setRighe(d.progetti ?? [])
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di caricamento')
    } finally {
      setLoading(false)
    }
  }, [dal, al])

  useEffect(() => { carica() }, [carica])

  const totale = useMemo(() => righe.reduce((s, r) => s + r.ore, 0), [righe])
  const imputate = useMemo(
    () => righe.filter((r) => r.progettoId !== null).reduce((s, r) => s + r.ore, 0),
    [righe],
  )

  /** Scorciatoie: i periodi che si chiedono davvero, senza digitare due date. */
  function periodo(tipo: 'anno' | 'mese' | 'annoScorso') {
    const a = oggi.getFullYear()
    if (tipo === 'anno') { setDal(ymd(new Date(a, 0, 1))); setAl(ymd(oggi)) }
    if (tipo === 'annoScorso') { setDal(`${a - 1}-01-01`); setAl(`${a - 1}-12-31`) }
    if (tipo === 'mese') {
      setDal(ymd(new Date(a, oggi.getMonth(), 1)))
      setAl(ymd(oggi))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Ore per progetto"
        backHref="/risorse-umane/timbrature"
        backLabel="Torna ai fogli ore"
      />

      <div className="max-w-3xl mx-auto px-4 py-5">
        <p className="text-sm text-gray-500 mb-4">
          Ore registrate sui servizi che prevedono il progetto (oggi <strong>Progettazione</strong>).
          {hr ? ' Vista Risorse Umane: tutti i dipendenti.' : ' Solo i tuoi collaboratori.'}
        </p>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-600">
              Dal
              <input
                type="date"
                value={dal}
                onChange={(e) => setDal(e.target.value)}
                className="block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5"
              />
            </label>
            <label className="text-xs text-gray-600">
              Al
              <input
                type="date"
                value={al}
                onChange={(e) => setAl(e.target.value)}
                className="block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm mt-0.5"
              />
            </label>
            <div className="flex gap-2 text-xs">
              <button onClick={() => periodo('mese')} className="px-2 py-1.5 rounded-lg border border-gray-300 bg-white hover:border-gray-400">mese</button>
              <button onClick={() => periodo('anno')} className="px-2 py-1.5 rounded-lg border border-gray-300 bg-white hover:border-gray-400">anno</button>
              <button onClick={() => periodo('annoScorso')} className="px-2 py-1.5 rounded-lg border border-gray-300 bg-white hover:border-gray-400">anno scorso</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <Kpi titolo="Ore totali" valore={`${oreLabel(totale)} h`} accento="cyan" />
          <Kpi titolo="Su un progetto" valore={`${oreLabel(imputate)} h`} accento="emerald" />
          <Kpi titolo="Progetti con ore" valore={righe.filter((r) => r.progettoId !== null).length} dimensione="lg" />
        </div>

        <div className="mb-4"><Banner tono="errore">{errore}</Banner></div>

        {loading ? (
          <div className="text-center text-gray-400 py-10">Caricamento…</div>
        ) : righe.length === 0 ? (
          <Vuoto>Nessuna ora di progettazione registrata in questo periodo.</Vuoto>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
            {righe.map((r) => {
              const chiave = r.progettoId ?? 0
              const espanso = aperto === chiave
              const quota = totale > 0 ? Math.round((r.ore / totale) * 100) : 0
              return (
                <div key={chiave}>
                  <button
                    onClick={() => setAperto(espanso ? null : chiave)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className={`font-medium ${r.progettoId === null ? 'text-amber-700' : 'text-gray-800'}`}>
                        {r.nome}
                      </span>
                      <span className="block text-xs text-gray-400">
                        {r.persone.length} {r.persone.length === 1 ? 'persona' : 'persone'} · {quota}% delle ore
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="font-bold text-gray-800">{oreLabel(r.ore)} h</span>
                      <span className="block text-xs text-gray-400">{espanso ? 'chiudi' : 'dettaglio'}</span>
                    </span>
                  </button>
                  {espanso && (
                    <div className="bg-gray-50 px-4 py-2">
                      {r.persone.map((p) => (
                        <div key={p.dipendenteId} className="flex justify-between py-1 text-sm">
                          <span className="text-gray-600">{p.cognomeNome}</span>
                          <span className="font-semibold text-gray-700">{oreLabel(p.ore)} h</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* La riga "Senza progetto" non e' un errore da nascondere: sono ore di
            progettazione che nessuno ha imputato, e sapere quante sono e' il
            primo passo per farle sparire. */}
        {!loading && righe.some((r) => r.progettoId === null) && (
          <p className="mt-3 text-xs text-gray-500">
            Le ore <strong>senza progetto</strong> sono progettazione non imputata a un bando: il campo
            e&apos; facoltativo. Si sistemano dalla scheda del dipendente nel cruscotto dei fogli ore.
          </p>
        )}
      </div>
    </div>
  )
}
