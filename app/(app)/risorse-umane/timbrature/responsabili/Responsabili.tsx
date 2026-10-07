'use client'

/**
 * Responsabili e abilitazioni: chi compila il foglio ore e chi lo valida.
 *
 * Pensata per chi la apre una volta al mese, magari dal telefono:
 *   - in cima, solo se serve, il riquadro "Da sistemare": frasi intere con il
 *     loro tasto, non etichette da interpretare;
 *   - due schede: "Chi valida chi" (le persone abilitate divise per
 *     responsabile) e "Tutte le persone" (con quattro filtri, non dieci);
 *   - si tocca la riga per modificarla. Le caselle per agire su più persone
 *     compaiono solo dopo "Seleziona più persone": sempre visibili erano rumore.
 *
 * Un responsabile NUOVO non si crea da nessuna parte: lo diventa chi viene
 * scelto come referente di almeno una persona. Per questo il menu attinge alla
 * rubrica degli account e non all'elenco dei responsabili esistenti.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Modale } from '@/components/ui/Modale'
import { Vuoto } from '@/components/ui/Vuoto'
import { SceltaPersona, type VoceRubrica } from '@/components/ui/SceltaPersona'
import { messaggioErrore } from '@/lib/risorse-umane/fetch'
import type {
  EsitoModificaAbilitazione,
  ModificaAbilitazione,
  PersonaAbilitazione,
} from '@/types/timbrature'
import {
  CASELLA_HR,
  FILTRI_BASE,
  PROBLEMI,
  conta,
  cerca,
  iniziali,
  inCaricoHr,
  nomeLeggibile,
  passa,
  perResponsabile,
  referenteSconosciuto,
  type Filtro,
} from './raggruppa'

type Vista = 'responsabili' | 'persone'

const chiave = (p: PersonaAbilitazione) => p.spItemId + p.entity

export function Responsabili({ rubrica }: { rubrica: VoceRubrica[] }) {
  const [persone, setPersone] = useState<PersonaAbilitazione[] | null>(null)
  const [errore, setErrore] = useState('')
  const [avvisi, setAvvisi] = useState<string[]>([])
  const [ok, setOk] = useState('')
  const [vista, setVista] = useState<Vista>('responsabili')
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const [testo, setTesto] = useState('')
  const [selezionando, setSelezionando] = useState(false)
  const [selezione, setSelezione] = useState<Set<string>>(new Set())
  const [inModifica, setInModifica] = useState<PersonaAbilitazione | null>(null)
  const [assegnaAperto, setAssegnaAperto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const nomi = useMemo(() => {
    const m = new Map<string, string>()
    for (const v of rubrica) m.set(v.email, v.nome)
    return m
  }, [rubrica])
  const inRubrica = useMemo(() => new Set(rubrica.map((v) => v.email)), [rubrica])
  const nomeDi = useCallback(
    (email: string) =>
      email === CASELLA_HR ? 'Risorse Umane' : nomi.get(email) ?? email.split('@')[0],
    [nomi],
  )

  const carica = useCallback(async () => {
    setErrore('')
    try {
      const res = await fetch('/api/timbrature/hr/responsabili', { cache: 'no-store' })
      if (!res.ok) throw new Error(await messaggioErrore(res, 'Errore di lettura'))
      const dati = await res.json()
      setPersone(dati.persone)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di lettura')
      setPersone((p) => p ?? [])
    }
  }, [])

  useEffect(() => {
    carica()
  }, [carica])

  const tutte = persone ?? []
  const conteggi = useMemo(() => conta(tutte, inRubrica), [tutte, inRubrica])
  const trovate = useMemo(() => tutte.filter((p) => cerca(p, testo, nomeDi)), [tutte, testo, nomeDi])
  const gruppi = useMemo(() => perResponsabile(trovate, nomeDi, inRubrica), [trovate, nomeDi, inRubrica])
  const filtrate = useMemo(() => trovate.filter((p) => passa(p, filtro, inRubrica)), [trovate, filtro, inRubrica])
  const problemi = PROBLEMI.filter((d) => conteggi[d.id] > 0)
  const problemaAttivo = PROBLEMI.find((d) => d.id === filtro)

  /** Chi è già responsabile di qualcuno: nel menu compare con la nota. */
  const responsabiliAttuali = useMemo(
    () => [...new Set(tutte.filter((p) => p.abilitata && p.referente).map((p) => p.referente!))],
    [tutte],
  )

  const selezionate = useMemo(() => tutte.filter((p) => selezione.has(chiave(p))), [tutte, selezione])

  function alterna(p: PersonaAbilitazione) {
    setSelezione((s) => {
      const n = new Set(s)
      if (n.has(chiave(p))) n.delete(chiave(p))
      else n.add(chiave(p))
      return n
    })
  }

  function alternaGruppo(lista: PersonaAbilitazione[]) {
    setSelezione((s) => {
      const n = new Set(s)
      const tutti = lista.every((p) => n.has(chiave(p)))
      for (const p of lista) {
        if (tutti) n.delete(chiave(p))
        else n.add(chiave(p))
      }
      return n
    })
  }

  function chiudiSelezione() {
    setSelezionando(false)
    setSelezione(new Set())
  }

  /** Tocco sulla riga: in selezione spunta, altrimenti apre la modifica. */
  function tocca(p: PersonaAbilitazione) {
    if (selezionando) alterna(p)
    else setInModifica(p)
  }

  function vedi(f: Filtro) {
    setFiltro(f)
    setVista('persone')
    setTesto('')
  }

  /** Manda le modifiche, aggiorna l'elenco con le schede rilette, raccoglie avvisi ed errori. */
  async function salva(modifiche: ModificaAbilitazione[], messaggioOk: string): Promise<boolean> {
    setSalvando(true)
    setErrore('')
    setOk('')
    setAvvisi([])
    try {
      const res = await fetch('/api/timbrature/hr/responsabili', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modifiche }),
      })
      if (!res.ok) throw new Error(await messaggioErrore(res, 'Errore di salvataggio'))
      const { esiti } = (await res.json()) as { esiti: EsitoModificaAbilitazione[] }

      const aggiornate = new Map<string, PersonaAbilitazione>()
      for (const e of esiti) if (e.ok && e.persona) aggiornate.set(chiave(e.persona), e.persona)
      setPersone((ps) => (ps ?? []).map((p) => aggiornate.get(chiave(p)) ?? p))
      setSelezione((s) => {
        const n = new Set(s)
        for (const k of aggiornate.keys()) n.delete(k)
        return n
      })

      const falliti = esiti.filter((e) => !e.ok)
      setAvvisi(esiti.map((e) => e.avviso).filter((a): a is string => !!a))
      if (falliti.length) {
        setErrore(falliti.map((e) => e.errore).join(' · '))
        return false
      }
      setOk(messaggioOk)
      return true
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di salvataggio')
      return false
    } finally {
      setSalvando(false)
    }
  }

  async function riallinea() {
    setSalvando(true)
    setErrore('')
    setOk('')
    try {
      const res = await fetch('/api/timbrature/hr/sincronizza', { method: 'POST' })
      if (!res.ok) throw new Error(await messaggioErrore(res, 'Errore di sincronizzazione'))
      await carica()
      setOk('Fatto: il foglio ore ora rispecchia l’anagrafica.')
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di sincronizzazione')
    } finally {
      setSalvando(false)
    }
  }

  async function assegna(email: string | null) {
    const n = selezionate.length
    const chi = n === 1 ? '1 persona' : `${n} persone`
    const fatto = await salva(
      selezionate.map((p) => ({ entity: p.entity, spItemId: p.spItemId, referente: email })),
      email ? `${nomeDi(email)} ora valida il foglio ore di ${chi}.` : `Ora il foglio ore di ${chi} lo validano le HR.`,
    )
    if (fatto) {
      setAssegnaAperto(false)
      chiudiSelezione()
    }
  }

  async function attivaSelezionate() {
    // Solo i lavoratori: soci volontari e schede senza tipo di rapporto si
    // saltano qui, e il server li rifiuterebbe comunque.
    const da = selezionate.filter((p) => !p.timbraturaAttiva && p.lavoro === 'lavoratore')
    const saltate = selezionate.filter((p) => !p.timbraturaAttiva && p.lavoro !== 'lavoratore')
    if (da.length === 0) return
    const fatto = await salva(
      da.map((p) => ({ entity: p.entity, spItemId: p.spItemId, timbraturaAttiva: true })),
      `Timbrature attivate per ${da.length === 1 ? '1 persona' : `${da.length} persone`}.` +
        (saltate.length
          ? ` ${saltate.length === 1 ? '1 saltata' : `${saltate.length} saltate`}: senza un rapporto di lavoro indicato.`
          : ''),
    )
    if (fatto) chiudiSelezione()
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="bg-primary text-white px-5 py-4">
        <Link href="/risorse-umane/timbrature" className="text-white/70 text-sm hover:text-white">
          ← Torna ai fogli ore
        </Link>
        <h1 className="text-lg font-bold">Responsabili e abilitazioni</h1>
        <p className="text-white/80 text-sm mt-0.5">Chi compila il foglio ore, e chi lo controlla a fine mese.</p>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <Banner tono="errore">{errore}</Banner>
        <Banner tono="ok">{ok}</Banner>
        {avvisi.length > 0 && (
          <Banner tono="avviso">
            <ul className="space-y-1">
              {avvisi.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </Banner>
        )}

        {/* Da sistemare: frasi intere, ognuna con il suo tasto */}
        {persone !== null && problemi.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="font-bold text-amber-900">Da sistemare</h2>
            <ul className="mt-2 divide-y divide-amber-200/70">
              {problemi.map((d) => (
                <li key={d.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-amber-900">{d.frase(conteggi[d.id])}</p>
                    <p className="text-xs text-amber-800/80">{d.rimedio}</p>
                  </div>
                  {d.id === 'disallineati' ? (
                    <button
                      onClick={riallinea}
                      disabled={salvando}
                      className="rounded-lg bg-amber-600 disabled:bg-gray-300 text-white px-4 py-2 text-sm font-semibold"
                    >
                      Riallinea
                    </button>
                  ) : (
                    <button
                      onClick={() => vedi(d.id)}
                      className="rounded-lg border border-amber-400 bg-white text-amber-900 px-4 py-2 text-sm font-semibold"
                    >
                      Vedi chi
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Le due schede */}
        <div className="grid grid-cols-2 rounded-xl bg-gray-200/70 p-1" role="tablist">
          {(
            [
              ['responsabili', 'Chi valida chi'],
              ['persone', 'Tutte le persone'],
            ] as const
          ).map(([v, et]) => (
            <button
              key={v}
              role="tab"
              aria-selected={vista === v}
              onClick={() => {
                setVista(v)
                if (v === 'persone' && problemaAttivo) setFiltro('tutti')
              }}
              className={`rounded-lg py-2.5 text-sm font-semibold ${
                vista === v ? 'bg-white text-primary shadow-sm' : 'text-gray-600'
              }`}
            >
              {et}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder="Cerca un nome…"
            className="grow min-w-[10rem] rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          {!selezionando && tutte.length > 0 && (
            <button
              onClick={() => setSelezionando(true)}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700"
            >
              Seleziona più persone
            </button>
          )}
        </div>

        {vista === 'persone' && (
          <div className="flex flex-wrap gap-2">
            {problemaAttivo ? (
              <button
                onClick={() => setFiltro('tutti')}
                className="rounded-full bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1.5 text-sm font-semibold"
              >
                {problemaAttivo.etichetta} · {conteggi[problemaAttivo.id]} <span aria-hidden>✕</span>
                <span className="sr-only">Togli il filtro</span>
              </button>
            ) : (
              FILTRI_BASE.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFiltro(f.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                    filtro === f.id ? 'bg-primary border-primary text-white' : 'bg-white border-gray-200 text-gray-700'
                  }`}
                >
                  {f.etichetta} <span className="opacity-60 font-normal">{conteggi[f.id]}</span>
                </button>
              ))
            )}
          </div>
        )}

        {persone === null ? (
          <p className="text-center text-sm text-gray-400 py-10">Caricamento…</p>
        ) : vista === 'responsabili' ? (
          gruppi.length === 0 ? (
            <Vuoto>{testo ? 'Nessun nome trovato.' : 'Nessuna persona ha ancora le timbrature attive.'}</Vuoto>
          ) : (
            <div className="space-y-4">
              {gruppi.map((g) => {
                const tuttiSel = g.persone.every((p) => selezione.has(chiave(p)))
                const hr = g.chiave === 'hr'
                return (
                  <section
                    key={g.chiave}
                    className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${
                      g.sconosciuto ? 'border-amber-300' : 'border-gray-100'
                    }`}
                  >
                    <header
                      className={`flex items-center gap-3 px-4 py-3 ${g.sconosciuto ? 'bg-amber-50' : 'bg-slate-50'}`}
                    >
                      <Cerchio
                        testo={hr ? 'HR' : g.sconosciuto ? '!' : iniziali(g.titolo)}
                        tono={g.sconosciuto ? 'ambra' : hr ? 'grigio' : 'blu'}
                        grande
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-gray-800">{g.titolo}</div>
                        <div className={`text-xs ${g.sconosciuto ? 'text-amber-800' : 'text-gray-500'} break-words`}>
                          {g.sottotitolo ||
                            `controlla ${g.persone.length === 1 ? '1 persona' : `${g.persone.length} persone`}`}
                        </div>
                      </div>
                      {selezionando && (
                        <button
                          onClick={() => alternaGruppo(g.persone)}
                          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600"
                        >
                          {tuttiSel ? 'Togli tutti' : 'Prendi tutti'}
                        </button>
                      )}
                    </header>
                    <ul className="divide-y divide-gray-100">
                      {g.persone.map((p) => (
                        <Riga
                          key={chiave(p)}
                          p={p}
                          selezionando={selezionando}
                          selezionata={selezione.has(chiave(p))}
                          onTocca={() => tocca(p)}
                          nomeDi={nomeDi}
                          mostraStato={false}
                          sconosciuto={referenteSconosciuto(p, inRubrica)}
                        />
                      ))}
                    </ul>
                  </section>
                )
              })}
              <p className="text-xs text-gray-500 px-1">
                Qui ci sono solo le persone con le timbrature attive. Per attivarne altre: “Tutte le persone” →
                “Non abilitati”.
              </p>
            </div>
          )
        ) : filtrate.length === 0 ? (
          <Vuoto>Nessuna persona in questo elenco.</Vuoto>
        ) : (
          <div className="space-y-2">
            {problemaAttivo && <p className="text-sm text-amber-800 px-1">{problemaAttivo.rimedio}</p>}
            <ul className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {filtrate.map((p) => (
                <Riga
                  key={chiave(p)}
                  p={p}
                  selezionando={selezionando}
                  selezionata={selezione.has(chiave(p))}
                  onTocca={() => tocca(p)}
                  nomeDi={nomeDi}
                  mostraStato
                  sconosciuto={referenteSconosciuto(p, inRubrica)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Barra della selezione: fissa in fondo, va a capo su telefono */}
      {selezionando && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-700 mr-auto">
              {selezionate.length === 0
                ? 'Tocca le persone da scegliere'
                : selezionate.length === 1
                  ? '1 scelta'
                  : `${selezionate.length} scelte`}
            </span>
            <button onClick={chiudiSelezione} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600">
              Fine
            </button>
            {selezionate.some((p) => !p.timbraturaAttiva && p.lavoro === 'lavoratore') && (
              <button
                onClick={attivaSelezionate}
                disabled={salvando}
                className="rounded-lg border border-primary text-primary px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Attiva timbrature
              </button>
            )}
            <button
              onClick={() => setAssegnaAperto(true)}
              disabled={salvando || selezionate.length === 0}
              className="grow sm:grow-0 rounded-lg bg-primary disabled:bg-gray-300 text-white px-4 py-2 text-sm font-semibold"
            >
              Cambia responsabile
            </button>
          </div>
        </div>
      )}

      {inModifica && (
        <ModaleModifica
          p={inModifica}
          rubrica={rubrica}
          responsabiliAttuali={responsabiliAttuali}
          nomeDi={nomeDi}
          salvando={salvando}
          onChiudi={() => setInModifica(null)}
          onSalva={async (m) => {
            const fatto = await salva([m], `Salvato: ${nomeLeggibile(inModifica.nominativo)}.`)
            if (fatto) setInModifica(null)
          }}
        />
      )}

      {assegnaAperto && (
        <ModaleAssegna
          persone={selezionate}
          rubrica={rubrica}
          responsabiliAttuali={responsabiliAttuali}
          nomeDi={nomeDi}
          salvando={salvando}
          onChiudi={() => setAssegnaAperto(false)}
          onAssegna={assegna}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------- pezzi */

const TONI_CERCHIO = {
  blu: 'bg-primary/10 text-primary',
  grigio: 'bg-gray-200 text-gray-600',
  ambra: 'bg-amber-200 text-amber-900',
  verde: 'bg-emerald-100 text-emerald-800',
} as const

function Cerchio({ testo, tono, grande = false }: { testo: string; tono: keyof typeof TONI_CERCHIO; grande?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${TONI_CERCHIO[tono]} ${
        grande ? 'h-10 w-10 text-sm' : 'h-9 w-9 text-xs'
      }`}
    >
      {testo}
    </span>
  )
}

/** Una nota colorata sotto il nome: parole, non sigle. */
function Nota({ testo, tono }: { testo: string; tono: 'ambra' | 'rosso' | 'viola' | 'grigio' }) {
  const cls = {
    ambra: 'bg-amber-100 text-amber-900',
    rosso: 'bg-red-100 text-red-800',
    viola: 'bg-fuchsia-100 text-fuchsia-800',
    grigio: 'bg-gray-100 text-gray-600',
  }[tono]
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{testo}</span>
}

function Riga({
  p,
  selezionando,
  selezionata,
  onTocca,
  nomeDi,
  mostraStato,
  sconosciuto,
}: {
  p: PersonaAbilitazione
  selezionando: boolean
  selezionata: boolean
  onTocca: () => void
  nomeDi: (email: string) => string
  /** Nella scheda "Tutte le persone" serve dire se timbra e chi lo valida. */
  mostraStato: boolean
  sconosciuto: boolean
}) {
  const nome = nomeLeggibile(p.nominativo)
  const note: { testo: string; tono: 'ambra' | 'rosso' | 'viola' | 'grigio' }[] = []
  if (p.abilitata && p.nonTimbra) note.push({ testo: 'non timbra', tono: 'viola' })
  if (p.categoria !== 'Dipendente') note.push({ testo: p.categoria.toLowerCase(), tono: 'grigio' })
  if (p.lavoro === 'incerto' && !p.chiuso) note.push({ testo: 'manca il tipo di rapporto', tono: 'ambra' })
  if (p.lavoro === 'non-lavoratore') note.push({ testo: 'non lavoratore', tono: 'grigio' })
  if (p.decaduta) note.push({ testo: 'rapporto chiuso', tono: 'rosso' })
  if (p.timbraturaAttiva && !p.mail && !p.chiuso) note.push({ testo: 'manca la mail', tono: 'rosso' })
  if (p.senzaOrario) note.push({ testo: 'manca l’orario', tono: 'ambra' })
  if (p.disallineata) note.push({ testo: 'da riallineare', tono: 'ambra' })

  let stato = ''
  if (mostraStato) {
    if (!p.abilitata) {
      stato = p.chiuso
        ? 'Rapporto chiuso'
        : p.lavoro === 'lavoratore'
          ? 'Timbrature non attive'
          : 'Non si possono attivare le timbrature'
    }
    else if (inCaricoHr(p)) stato = 'Valida: Risorse Umane'
    else if (sconosciuto) stato = `Valida: ${p.referente} (non esiste)`
    else stato = `Valida: ${nomeDi(p.referente!)}`
  }

  return (
    <li>
      <button
        type="button"
        onClick={onTocca}
        aria-pressed={selezionando ? selezionata : undefined}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
          selezionata ? 'bg-cyan-50' : 'hover:bg-gray-50 active:bg-gray-100'
        }`}
      >
        {selezionando ? (
          <span
            aria-hidden
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold ${
              selezionata ? 'border-primary bg-primary text-white' : 'border-gray-300 bg-white'
            }`}
          >
            {selezionata ? '✓' : ''}
          </span>
        ) : (
          <Cerchio testo={iniziali(nome)} tono={p.abilitata ? 'verde' : 'grigio'} />
        )}
        <span className="min-w-0 flex-1">
          <span className={`block font-semibold ${p.abilitata || !mostraStato ? 'text-gray-800' : 'text-gray-500'}`}>
            {nome}
          </span>
          {stato && (
            <span className={`block text-xs ${sconosciuto && p.abilitata ? 'text-amber-800 font-semibold' : 'text-gray-500'}`}>
              {stato}
            </span>
          )}
          {note.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {note.map((n) => (
                <Nota key={n.testo} {...n} />
              ))}
            </span>
          )}
        </span>
        {!selezionando && (
          <span aria-hidden className="shrink-0 text-xl text-gray-300">
            ›
          </span>
        )}
      </button>
    </li>
  )
}

/* ------------------------------------------------------- scelta referente */

/**
 * Le tre strade per il referente: le HR, nessuno, oppure una persona dalla
 * rubrica (anche una che non è ancora responsabile di nessuno: è così che si
 * aggiunge un responsabile nuovo).
 */
function SceltaReferente({
  valore,
  onCambia,
  rubrica,
  responsabiliAttuali,
  nomeDi,
  mostraAttuale = true,
}: {
  valore: string | null
  onCambia: (email: string | null) => void
  rubrica: VoceRubrica[]
  responsabiliAttuali: string[]
  nomeDi: (email: string) => string
  mostraAttuale?: boolean
}) {
  const hr = !valore || valore === CASELLA_HR
  return (
    <div className="space-y-2">
      {mostraAttuale && (
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5">
          <Cerchio testo={hr ? 'HR' : iniziali(nomeDi(valore!))} tono={hr ? 'grigio' : 'blu'} />
          <span className="min-w-0">
            <span className="block font-semibold text-gray-800">{hr ? 'Risorse Umane' : nomeDi(valore!)}</span>
            {!hr && <span className="block text-xs text-gray-400 break-all">{valore}</span>}
          </span>
        </div>
      )}
      <SceltaPersona
        rubrica={rubrica}
        giaPresenti={responsabiliAttuali}
        notaPresenti="già responsabile"
        onScegli={(v) => onCambia(v.email)}
      />
      <button
        type="button"
        onClick={() => onCambia(CASELLA_HR)}
        className="text-sm font-semibold text-brand-cyan-dark underline underline-offset-2"
      >
        Lo validano le Risorse Umane
      </button>
      <p className="text-xs text-gray-500">
        Per un responsabile nuovo basta cercarlo qui: da quel momento vede la sua squadra in “Fogli ore da validare”.
      </p>
    </div>
  )
}

/** Interruttore a levetta con la spiegazione sotto: si capisce senza leggere un manuale. */
function Levetta({
  titolo,
  spiegazione,
  valore,
  onChange,
  disabilitata = false,
}: {
  titolo: string
  spiegazione: string
  valore: boolean
  onChange: (v: boolean) => void
  disabilitata?: boolean
}) {
  return (
    <label className={`flex items-start gap-3 py-2 ${disabilitata ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="sr-only peer"
        checked={valore}
        disabled={disabilitata}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={`mt-0.5 relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${
          valore ? 'bg-emerald-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
            valore ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-gray-800">{titolo}</span>
        <span className="block text-xs text-gray-500">{spiegazione}</span>
      </span>
    </label>
  )
}

/* -------------------------------------------------------- modale singola */

function ModaleModifica({
  p,
  rubrica,
  responsabiliAttuali,
  nomeDi,
  salvando,
  onChiudi,
  onSalva,
}: {
  p: PersonaAbilitazione
  rubrica: VoceRubrica[]
  responsabiliAttuali: string[]
  nomeDi: (email: string) => string
  salvando: boolean
  onChiudi: () => void
  onSalva: (m: ModificaAbilitazione) => void
}) {
  const [attiva, setAttiva] = useState(p.timbraturaAttiva)
  const [nonTimbra, setNonTimbra] = useState(p.nonTimbra)
  const [referente, setReferente] = useState<string | null>(p.referente)

  const m: ModificaAbilitazione = { entity: p.entity, spItemId: p.spItemId }
  if (attiva !== p.timbraturaAttiva) m.timbraturaAttiva = attiva
  if (nonTimbra !== p.nonTimbra) m.nonTimbra = nonTimbra
  if (referente !== p.referente) m.referente = referente
  const cambiato = Object.keys(m).length > 2
  const seStesso = !!referente && referente === p.mail
  // Si può sempre SPEGNERE; accendere solo se è un lavoratore.
  const nonAttivabile = p.lavoro !== 'lavoratore' && !p.timbraturaAttiva

  return (
    <Modale
      titolo={nomeLeggibile(p.nominativo)}
      sottotitolo={p.mail || 'Manca la mail aziendale'}
      onChiudi={onChiudi}
      azioni={
        <>
          <button onClick={onChiudi} className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm text-gray-600">
            Annulla
          </button>
          <button
            onClick={() => onSalva(m)}
            disabled={!cambiato || salvando || seStesso}
            className="flex-1 rounded-lg bg-primary disabled:bg-gray-300 text-white py-2.5 text-sm font-semibold"
          >
            {salvando ? 'Salvataggio…' : 'Salva'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {p.chiuso && (
          <Banner tono="avviso">
            Il rapporto risulta chiuso ({p.statoRapporto.toLowerCase()}): anche con le timbrature accese non potrà
            entrare.
          </Banner>
        )}
        {p.lavoro === 'incerto' && !p.chiuso && (
          <Banner tono="avviso">
            Nella scheda manca il “Tipo di rapporto”: finché non si sa se è un lavoratore, le timbrature non si possono
            attivare. Si sceglie nella scheda in Risorse Umane.
          </Banner>
        )}
        {p.lavoro === 'non-lavoratore' && (
          <Banner tono="info">
            Non è un lavoratore (tipo di rapporto: socio non lavoratore): non ha un foglio ore.
          </Banner>
        )}
        {!p.mail && (
          <Banner tono="avviso">
            Manca la mail aziendale: va inserita nella scheda in Risorse Umane, altrimenti non può entrare.
          </Banner>
        )}
        <div className="divide-y divide-gray-100">
          <Levetta
            titolo="Timbrature attive"
            spiegazione="Può entrare nell’app e compilare il suo foglio ore."
            valore={attiva}
            onChange={setAttiva}
            disabilitata={nonAttivabile}
          />
          <Levetta
            titolo="Non timbra"
            spiegazione="Il mese si genera dal suo orario teorico: si segnano solo ferie e assenze."
            valore={nonTimbra}
            onChange={setNonTimbra}
          />
          {nonTimbra && !attiva && (
            <p className="text-xs text-amber-700 pb-2">
              “Non timbra” funziona solo insieme a “Timbrature attive”.
            </p>
          )}
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800 mb-2">Chi controlla il suo foglio ore</p>
          <SceltaReferente
            valore={referente}
            onCambia={setReferente}
            rubrica={rubrica}
            responsabiliAttuali={responsabiliAttuali}
            nomeDi={nomeDi}
          />
          {seStesso && (
            <p className="text-sm text-red-600 mt-2">Una persona non può controllare il proprio foglio ore.</p>
          )}
        </div>
      </div>
    </Modale>
  )
}

/* -------------------------------------------------------- modale multipla */

function ModaleAssegna({
  persone,
  rubrica,
  responsabiliAttuali,
  nomeDi,
  salvando,
  onChiudi,
  onAssegna,
}: {
  persone: PersonaAbilitazione[]
  rubrica: VoceRubrica[]
  responsabiliAttuali: string[]
  nomeDi: (email: string) => string
  salvando: boolean
  onChiudi: () => void
  onAssegna: (email: string | null) => void
}) {
  // undefined = non ancora scelto
  const [scelto, setScelto] = useState<string | null | undefined>(undefined)
  const conflitto = scelto ? persone.find((p) => p.mail === scelto) : undefined
  const hr = scelto === null || scelto === CASELLA_HR

  return (
    <Modale
      titolo="Cambia responsabile"
      sottotitolo={
        persone.length === 1 ? nomeLeggibile(persone[0].nominativo) : `Per ${persone.length} persone`
      }
      onChiudi={onChiudi}
      azioni={
        <>
          <button onClick={onChiudi} className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm text-gray-600">
            Annulla
          </button>
          <button
            onClick={() => scelto !== undefined && onAssegna(scelto)}
            disabled={scelto === undefined || salvando || !!conflitto}
            className="flex-1 rounded-lg bg-primary disabled:bg-gray-300 text-white py-2.5 text-sm font-semibold"
          >
            {salvando ? 'Salvataggio…' : 'Conferma'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {scelto === undefined ? (
          <SceltaReferente
            valore={null}
            onCambia={setScelto}
            rubrica={rubrica}
            responsabiliAttuali={responsabiliAttuali}
            nomeDi={nomeDi}
            mostraAttuale={false}
          />
        ) : (
          <div className="rounded-xl bg-cyan-50 border border-cyan-200 px-3 py-3 text-sm text-gray-800">
            {hr ? (
              <>
                Il foglio ore lo controlleranno le <b>Risorse Umane</b>.
              </>
            ) : (
              <>
                Il foglio ore lo controllerà <b>{nomeDi(scelto!)}</b>.
              </>
            )}
            <button
              onClick={() => setScelto(undefined)}
              className="block mt-1 text-xs font-semibold text-brand-cyan-dark underline"
            >
              Scegli un altro
            </button>
          </div>
        )}
        {conflitto && (
          <p className="text-sm text-red-600">
            {nomeLeggibile(conflitto.nominativo)} è fra le persone scelte: non può controllare il proprio foglio ore.
          </p>
        )}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Persone scelte</p>
          <ul className="max-h-40 overflow-y-auto text-sm text-gray-700 space-y-0.5">
            {persone.map((p) => (
              <li key={chiave(p)}>
                {nomeLeggibile(p.nominativo)}
                {!p.abilitata && <span className="text-amber-700 text-xs"> — timbrature non attive</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modale>
  )
}
