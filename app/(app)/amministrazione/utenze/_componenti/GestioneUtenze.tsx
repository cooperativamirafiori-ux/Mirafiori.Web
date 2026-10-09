'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Kpi } from '@/components/ui/Kpi'
import { Pill } from '@/components/ui/Pill'
import { Banner } from '@/components/ui/Banner'
import { Vuoto } from '@/components/ui/Vuoto'
import { ETICHETTA_TIPO, normCodice, type DaCollegare, type StrutturaCc, type UtenzaConUltima } from '@/types/utenze'
import { data, euro, numero, EMOJI_TIPO } from '../../costi-strutture/_componenti/formato'
import { ModaleUtenza } from './ModaleUtenza'
import { ModaleCollega } from './ModaleCollega'

export function GestioneUtenze({
  utenze,
  strutture,
  daCollegare,
  conflitti,
  anno,
}: {
  utenze: UtenzaConUltima[]
  strutture: StrutturaCc[]
  daCollegare: DaCollegare[]
  conflitti: Array<{ fatturaId: string; fornitore: string; numero: string; data: string; ccFattura: string | null; ccQuote: string[] }>
  anno: number
}) {
  const router = useRouter()
  const [modifica, setModifica] = useState<UtenzaConUltima | 'nuova' | null>(null)
  const [collega, setCollega] = useState<DaCollegare | null>(null)
  const [messaggio, setMessaggio] = useState('')
  const [errore, setErrore] = useState('')
  const [rileggo, setRileggo] = useState(false)
  const [cerca, setCerca] = useState('')

  const nomeStruttura = useMemo(() => new Map(strutture.map((s) => [s.id, `${s.codice} · ${s.nome}`])), [strutture])

  const gruppi = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    const filtrate = utenze.filter((u) =>
      !q || [u.codice, u.fornitore, u.note, nomeStruttura.get(u.strutturaId ?? 0) ?? ''].some((t) => t.toLowerCase().includes(q)),
    )
    const m = new Map<string, UtenzaConUltima[]>()
    for (const u of filtrate) {
      const k = u.strutturaId ? nomeStruttura.get(u.strutturaId) ?? 'Struttura non trovata' : 'Senza struttura'
      m.set(k, [...(m.get(k) ?? []), u])
    }
    return [...m.entries()].sort(([a], [b]) => (a === 'Senza struttura' ? 1 : b === 'Senza struttura' ? -1 : a.localeCompare(b, 'it')))
  }, [utenze, nomeStruttura, cerca])

  // Percentuale totale per codice: sopra 100 la bolletta resta da collegare
  // (sarebbe contata più volte), sotto 100 una parte non va da nessuna parte.
  const totalePerCodice = useMemo(() => {
    const m = new Map<string, number>()
    for (const u of utenze) if (!u.segnaposto) m.set(normCodice(u.codice), (m.get(normCodice(u.codice)) ?? 0) + u.percentuale)
    return m
  }, [utenze])
  const percentualeStorta = (u: UtenzaConUltima) => {
    const t = totalePerCodice.get(normCodice(u.codice)) ?? 100
    return u.segnaposto || Math.abs(t - 100) < 0.01 ? null : t
  }

  const daCompletare = utenze.filter((u) => u.segnaposto || !u.strutturaId || percentualeStorta(u) !== null).length
  const segnaposti = utenze.filter((u) => u.segnaposto && u.strutturaId)

  const fatto = (testo: string) => {
    setMessaggio(testo)
    setErrore('')
    router.refresh()
  }

  async function rileggi() {
    setRileggo(true)
    setErrore('')
    setMessaggio('')
    try {
      const r = await fetch('/api/utenze/rileggi', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Errore')
      fatto(
        `Rilette ${j.lette} fatture: ${j.bollette} bollette trovate.` +
          (j.rimaste ? ` Ne restano ${j.rimaste}: premi di nuovo.` : '') +
          (j.senzaFile ? ` ${j.senzaFile} senza file in "Importate".` : '') +
          (j.errori?.length ? ` ${j.errori.length} file illeggibili.` : ''),
      )
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setRileggo(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi titolo="utenze in elenco" valore={utenze.length} dimensione="lg" />
        <Kpi titolo="da completare" valore={daCompletare} dimensione="lg" accento={daCompletare ? 'amber' : undefined} />
        <Kpi titolo="codici da collegare" valore={daCollegare.length} dimensione="lg" accento={daCollegare.length ? 'red' : undefined} />
        <Kpi titolo={`bollette ${anno}`} valore={utenze.reduce((s, u) => s + u.bolletteAnno, 0)} dimensione="lg" accento="cyan" />
      </div>

      <Banner tono="ok">{messaggio}</Banner>
      <Banner tono="errore">{errore}</Banner>

      {conflitti.length > 0 && (
        <Banner tono="avviso">
          <p className="font-semibold">
            {conflitti.length} {conflitti.length === 1 ? 'fattura ha' : 'fatture hanno'} un centro di costo diverso da quello della sua utenza
          </p>
          <p className="mt-1">
            Non sono doppioni, ma il Cruscotto CdG (che guarda la fattura) e Costi per struttura (che guarda l&apos;utenza) le
            mettono in posti diversi. Sistemale da Controllo di Gestione → Fatture del servizio.
          </p>
          <ul className="mt-2 space-y-0.5">
            {conflitti.slice(0, 8).map((c) => (
              <li key={c.fatturaId}>
                {c.fornitore} n. {c.numero} del {data(c.data)}: fattura su {c.ccFattura ?? 'nessun centro'}, utenza su {c.ccQuote.join(' + ')}
              </li>
            ))}
            {conflitti.length > 8 && <li>… e altre {conflitti.length - 8}</li>}
          </ul>
        </Banner>
      )}

      {daCollegare.length > 0 && (
        <section>
          <h3 className="font-bold text-gray-800 mb-1">Da collegare</h3>
          <p className="text-sm text-gray-500 mb-3">
            Codici arrivati in fattura che l&apos;elenco non conosce: finché non hanno una struttura, la loro spesa non va da nessuna parte.
          </p>
          <div className="space-y-2">
            {daCollegare.map((d) => (
              <div key={d.codice} className="bg-white rounded-xl border border-red-200 p-4 flex flex-wrap items-center gap-3">
                <span className="text-xl">{EMOJI_TIPO[d.tipo]}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-semibold text-gray-800 break-all">{d.codice}</p>
                  <p className="text-xs text-gray-500">
                    {ETICHETTA_TIPO[d.tipo]} · {d.fornitore} · {d.bollette} {d.bollette === 1 ? 'bolletta' : 'bollette'} · {euro(d.importo, 2)} · ultima {data(d.ultima)}
                  </p>
                </div>
                <button onClick={() => setCollega(d)} className="px-4 py-2 rounded-xl bg-brand-cyan text-white text-sm font-semibold">
                  Collega
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="font-bold text-gray-800 mr-auto">Elenco utenze</h3>
          <button onClick={() => setModifica('nuova')} className="px-4 py-2 rounded-xl bg-brand-cyan text-white text-sm font-semibold">
            + Nuova utenza
          </button>
        </div>
        <input
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca codice, struttura, fornitore…"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-base mb-4 focus:outline-none focus:ring-2 focus:ring-brand-cyan"
        />
        {!gruppi.length && <Vuoto>Nessuna utenza.</Vuoto>}
        <div className="space-y-5">
          {gruppi.map(([nome, righe]) => (
            <div key={nome}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{nome}</p>
              <div className="space-y-2">
                {righe.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setModifica(u)}
                    className="w-full text-left bg-white rounded-xl border border-gray-100 p-3.5 hover:border-brand-cyan transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{EMOJI_TIPO[u.tipo]}</span>
                      <span className="font-mono text-sm font-semibold text-gray-800 break-all">{u.codice}</span>
                      {u.percentuale < 100 && <Pill tono="neutro" text={`${numero(u.percentuale)}%`} />}
                      {u.segnaposto && <Pill tono="ambra" text="codice da completare" />}
                      {!u.strutturaId && <Pill tono="rosso" text="senza struttura" />}
                      {percentualeStorta(u) !== null && (
                        <Pill tono="rosso" text={`il codice somma al ${numero(percentualeStorta(u)!)}%`} />
                      )}
                      {u.fornitore && <span className="text-xs text-gray-500">{u.fornitore}</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">
                      {u.ultima
                        ? `Ultima bolletta ${data(u.ultima.data)} · ${euro(u.ultima.importo, 2)}` +
                          (u.ultima.consumo != null ? ` · ${numero(u.ultima.consumo)} ${u.ultima.unita ?? ''}` : '') +
                          (u.ultima.periodoDal ? ` · ${data(u.ultima.periodoDal)} → ${data(u.ultima.periodoAl)}` : '') +
                          ` · ${u.bolletteAnno} nel ${anno}`
                        : 'Nessuna bolletta arrivata finora'}
                    </p>
                    {u.note && <p className="text-xs text-gray-400 mt-1">{u.note}</p>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="font-semibold text-gray-800">Fatture arrivate prima dell&apos;area Utenze</h3>
        <p className="text-sm text-gray-500 mt-1 mb-3">
          Rilegge gli XML già importati e ne tira fuori le bollette. Si può premere più volte: riparte da dove era rimasto e non duplica niente.
        </p>
        <button
          onClick={rileggi}
          disabled={rileggo}
          className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 disabled:opacity-50"
        >
          {rileggo ? 'Sto rileggendo… (fino a 4 minuti)' : 'Rileggi le fatture già importate'}
        </button>
      </section>

      {modifica && (
        <ModaleUtenza
          utenza={modifica === 'nuova' ? null : modifica}
          strutture={strutture}
          onChiudi={() => setModifica(null)}
          onFatto={(t) => {
            setModifica(null)
            fatto(t)
          }}
        />
      )}
      {collega && (
        <ModaleCollega
          voce={collega}
          strutture={strutture}
          segnaposti={segnaposti.filter((s) => s.tipo === collega.tipo)}
          nomeStruttura={nomeStruttura}
          onChiudi={() => setCollega(null)}
          onFatto={(t) => {
            setCollega(null)
            fatto(t)
          }}
        />
      )}
    </div>
  )
}
