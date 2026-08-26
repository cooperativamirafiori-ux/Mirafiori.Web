'use client'

/**
 * L'area IT: dispositivi, SIM, chi ha cosa, e i due secchi delle cose da
 * sistemare — "da classificare" e "senza centro di costo".
 *
 * Gli storici arrivano interi dal server (due letture) e si raggruppano qui: una
 * scheda aperta non fa nessuna chiamata in più.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Kpi } from '@/components/ui/Kpi'
import { Pill } from '@/components/ui/Pill'
import { Vuoto } from '@/components/ui/Vuoto'
import type { VoceRubrica } from '@/lib/core/rubrica'
import type { AreaIT } from '@/lib/it/data'
import { euro } from '@/types/acquisti'
import { eBeneIT, type BeneInventario } from '@/types/inventario'
import { TIPI_CON_FIREWALL, TIPI_IT, type Assegnazione, type Sim } from '@/types/it'
import { SchedaDispositivo } from './SchedaDispositivo'
import { SchedaSim } from './SchedaSim'
import { NuovoDispositivo, NuovaSim } from './NuoviRecord'
import { salvaDispositivo } from './azioni'

type Vista = 'dispositivi' | 'sim' | 'persone' | 'sistemare'

export function AreaITSchermo({ area, rubrica }: { area: AreaIT; rubrica: VoceRubrica[] }) {
  const router = useRouter()
  const [dati, setDati] = useState(area)
  const [vista, setVista] = useState<Vista>('dispositivi')
  const [tipo, setTipo] = useState('')
  const [stato, setStato] = useState<'tutti' | 'assegnati' | 'liberi'>('tutti')
  const [query, setQuery] = useState('')
  const [nuovo, setNuovo] = useState<null | 'dispositivo' | 'sim'>(null)

  // ---- aggiornamenti locali ------------------------------------------------
  // Il server ha già fatto il suo (chiudere la precedente, derivare lo stato):
  // qui si rispecchia la stessa cosa per non ricaricare tutta la pagina.

  const rimpiazzaBene = (b: BeneInventario) =>
    setDati((d) => {
      const cega = d.dispositivi.some((r) => r.bene.spItemId === b.spItemId)
      return {
        ...d,
        // Un bene appena classificato non era fra i dispositivi (ci è arrivato
        // proprio perché non aveva un tipo): va aggiunto, non solo rimpiazzato,
        // altrimenti sparisce da tutte e due le viste fino al ricaricamento.
        dispositivi: cega
          ? d.dispositivi.map((r) => (r.bene.spItemId === b.spItemId ? { ...r, bene: b } : r))
          : eBeneIT(b)
            ? [{ bene: b, attiva: null }, ...d.dispositivi]
            : d.dispositivi,
        daClassificare: eBeneIT(b)
          ? d.daClassificare.filter((x) => x.spItemId !== b.spItemId)
          : d.daClassificare,
      }
    })

  const rimpiazzaSim = (s: Sim) =>
    setDati((d) => ({
      ...d,
      sim: d.sim.map((r) => (r.sim.spItemId === s.spItemId ? { ...r, sim: s } : r)),
    }))

  function assorbiAssegnazione(a: Assegnazione) {
    setDati((d) => {
      const chiave = a.genere === 'bene' ? 'bene' : 'sim'
      const altre = d.storici[chiave].filter((x) => x.spItemId !== a.spItemId)
      // Se questa è attiva, le altre dello stesso oggetto non possono esserlo:
      // è l'invariante che il server ha appena applicato.
      const aggiornate = altre.map((x) =>
        a.stato === 'Attiva' && x.oggettoId === a.oggettoId && x.stato === 'Attiva'
          ? { ...x, stato: 'Chiusa' as const, dataFine: x.dataFine ?? a.dataAssegnazione }
          : x,
      )
      const storici = { ...d.storici, [chiave]: [a, ...aggiornate] }
      const attivaDi = (id: number) =>
        storici[chiave].find((x) => x.oggettoId === id && x.stato === 'Attiva') ?? null

      return {
        ...d,
        storici,
        dispositivi:
          chiave === 'bene'
            ? d.dispositivi.map((r) =>
                Number(r.bene.spItemId) === a.oggettoId
                  ? { ...r, attiva: attivaDi(a.oggettoId) }
                  : r,
              )
            : d.dispositivi,
        sim:
          chiave === 'sim'
            ? d.sim.map((r) =>
                Number(r.sim.spItemId) === a.oggettoId ? { ...r, attiva: attivaDi(a.oggettoId) } : r,
              )
            : d.sim,
      }
    })
    // Lo stato del bene e i campi di comodo li ha riscritti il server: la
    // prossima lettura della pagina li porta aggiornati.
    router.refresh()
  }

  // ---- elenchi -------------------------------------------------------------

  const storicoBene = (id: string) => dati.storici.bene.filter((a) => a.oggettoId === Number(id))
  const storicoSim = (id: string) => dati.storici.sim.filter((a) => a.oggettoId === Number(id))

  const dispositivi = useMemo(() => {
    let l = dati.dispositivi
    if (tipo) l = l.filter((r) => r.bene.tipoIT === tipo)
    if (stato === 'assegnati') l = l.filter((r) => r.attiva)
    if (stato === 'liberi') l = l.filter((r) => !r.attiva)
    const q = query.trim().toLowerCase()
    if (q) {
      l = l.filter((r) =>
        [
          r.bene.numero,
          r.bene.descrizione,
          r.bene.marca,
          r.bene.modello,
          r.bene.numeroSerie,
          r.bene.idListaIT,
          r.attiva?.assegnatarioNome,
          r.attiva?.assegnatarioMail,
          r.attiva?.nomeUtenza,
          r.attiva?.centroDiCosto?.value,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    return l
  }, [dati.dispositivi, tipo, stato, query])

  const sim = useMemo(() => {
    let l = dati.sim
    if (stato === 'assegnati') l = l.filter((r) => r.attiva)
    if (stato === 'liberi') l = l.filter((r) => !r.attiva)
    const q = query.trim().toLowerCase()
    if (q) {
      l = l.filter((r) =>
        [r.sim.numero, r.sim.iccid, r.sim.operatore, r.sim.nomePiano, r.attiva?.assegnatarioNome]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    return l
  }, [dati.sim, stato, query])

  // `dati.dispositivi` contiene già solo i beni in patrimonio: i dismessi li
  // lascia fuori lib/it/data.ts, e la loro storia si legge in Inventario.
  const inPatrimonio = dati.dispositivi
  const senzaFirewall = inPatrimonio.filter(
    (r) => r.bene.tipoIT && TIPI_CON_FIREWALL.includes(r.bene.tipoIT) && r.bene.firewallInstallato !== true,
  )
  const senzaCentro = [
    ...dati.storici.bene.filter((a) => a.stato === 'Attiva' && !a.centroDiCosto),
    ...dati.storici.sim.filter((a) => a.stato === 'Attiva' && !a.centroDiCosto),
  ]
  const canoni = inPatrimonio.reduce((s, r) => s + (r.bene.canoneMensile ?? 0), 0)
  const canoniSim = dati.sim
    .filter((r) => r.sim.stato === 'Attiva')
    .reduce((s, r) => s + (r.sim.costoMensile ?? 0), 0)

  const daSistemare = dati.daClassificare.length + senzaCentro.length

  const smartphone = dati.dispositivi
    .filter((r) => r.bene.tipoIT === 'Smartphone' || r.bene.tipoIT === 'Tablet')
    .map((r) => ({
      id: Number(r.bene.spItemId),
      etichetta: `${r.bene.numero} · ${[r.bene.marca, r.bene.modello].filter(Boolean).join(' ')}`,
    }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Kpi titolo="Dispositivi in patrimonio" valore={inPatrimonio.length} dimensione="lg" />
        <Kpi titolo="Assegnati" valore={inPatrimonio.filter((r) => r.attiva).length} dimensione="lg" accento="emerald" />
        <Kpi titolo="PC senza firewall" valore={senzaFirewall.length} dimensione="lg" accento={senzaFirewall.length ? 'red' : 'slate'} />
        <Kpi titolo="Canoni al mese" valore={euro(canoni + canoniSim)} accento="violet" />
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {(
          [
            ['dispositivi', `Dispositivi (${dati.dispositivi.length})`],
            ['sim', `SIM (${dati.sim.length})`],
            ['persone', 'Per persona'],
            ['sistemare', `Da sistemare (${daSistemare})`],
          ] as Array<[Vista, string]>
        ).map(([v, etichetta]) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              vista === v
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {etichetta}
          </button>
        ))}
      </nav>

      {(vista === 'dispositivi' || vista === 'sim') && (
        <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-wrap gap-2 items-center">
          {vista === 'dispositivi' && (
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
            >
              <option value="">Tutti i tipi</option>
              {TIPI_IT.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <select
            value={stato}
            onChange={(e) => setStato(e.target.value as typeof stato)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
          >
            <option value="tutti">Assegnati e liberi</option>
            <option value="assegnati">Solo assegnati</option>
            <option value="liberi">Solo liberi</option>
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca numero, seriale, persona, utenza…"
            className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
          />
          <button
            onClick={() => setNuovo(vista === 'dispositivi' ? 'dispositivo' : 'sim')}
            className="bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
          >
            ＋ {vista === 'dispositivi' ? 'Dispositivo' : 'SIM'}
          </button>
        </div>
      )}

      {vista === 'dispositivi' &&
        (dispositivi.length === 0 ? (
          <Vuoto>
            {dati.dispositivi.length === 0
              ? 'Nessun dispositivo: portali dentro con la migrazione, o aggiungine uno.'
              : 'Nessun dispositivo con questi filtri.'}
          </Vuoto>
        ) : (
          <div className="space-y-2.5">
            {dispositivi.map((r) => (
              <SchedaDispositivo
                key={r.bene.spItemId}
                riga={r}
                storico={storicoBene(r.bene.spItemId)}
                centriDiCosto={dati.centriDiCosto}
                rubrica={rubrica}
                onBene={rimpiazzaBene}
                onAssegnazione={assorbiAssegnazione}
              />
            ))}
          </div>
        ))}

      {vista === 'dispositivi' && dati.dismessi > 0 && (
        <p className="text-xs text-gray-400 text-center">
          {dati.dismessi} dispositiv{dati.dismessi === 1 ? 'o' : 'i'} uscit
          {dati.dismessi === 1 ? 'o' : 'i'} dal patrimonio non compaiono qui.{' '}
          <Link href="/inventario" className="underline hover:text-gray-600">
            La loro storia è in Inventario
          </Link>
          .
        </p>
      )}

      {vista === 'sim' &&
        (sim.length === 0 ? (
          <Vuoto>Nessuna SIM con questi filtri.</Vuoto>
        ) : (
          <div className="space-y-2.5">
            {sim.map((r) => (
              <SchedaSim
                key={r.sim.spItemId}
                riga={r}
                storico={storicoSim(r.sim.spItemId)}
                centriDiCosto={dati.centriDiCosto}
                rubrica={rubrica}
                dispositivi={smartphone}
                onSim={rimpiazzaSim}
                onAssegnazione={assorbiAssegnazione}
              />
            ))}
          </div>
        ))}

      {vista === 'persone' && <PerPersona storici={dati.storici} />}

      {vista === 'sistemare' && (
        <DaSistemare
          daClassificare={dati.daClassificare}
          senzaCentro={senzaCentro}
          onBene={rimpiazzaBene}
        />
      )}

      {nuovo === 'dispositivo' && (
        <NuovoDispositivo
          onFatto={(b) => setDati((d) => ({ ...d, dispositivi: [{ bene: b, attiva: null }, ...d.dispositivi] }))}
          onChiudi={() => setNuovo(null)}
        />
      )}
      {nuovo === 'sim' && (
        <NuovaSim
          onFatto={(s) => setDati((d) => ({ ...d, sim: [{ sim: s, attiva: null }, ...d.sim] }))}
          onChiudi={() => setNuovo(null)}
        />
      )}
    </div>
  )
}

/** Chi ha cosa. La domanda vera è "cosa deve restituire chi se ne va". */
function PerPersona({ storici }: { storici: { bene: Assegnazione[]; sim: Assegnazione[] } }) {
  const persone = useMemo(() => {
    const m = new Map<string, { nome: string; cose: Assegnazione[] }>()
    for (const a of [...storici.bene, ...storici.sim]) {
      if (a.stato !== 'Attiva') continue
      const chiave = (a.assegnatarioMail ?? '').toLowerCase() || '(in condivisione)'
      const voce = m.get(chiave) ?? { nome: a.assegnatarioNome ?? chiave, cose: [] }
      voce.cose.push(a)
      m.set(chiave, voce)
    }
    return [...m.entries()].sort((x, y) => y[1].cose.length - x[1].cose.length)
  }, [storici])

  if (!persone.length) return <Vuoto>Nessuna assegnazione attiva.</Vuoto>

  return (
    <div className="space-y-2.5">
      {persone.map(([mail, v]) => (
        <div key={mail} className="bg-white rounded-xl border border-gray-100 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-gray-800">{v.nome}</p>
            <span className="text-xs text-gray-400">{v.cose.length} in carico</span>
          </div>
          {mail !== '(in condivisione)' && <p className="text-xs text-gray-500">{mail}</p>}
          <ul className="mt-2 space-y-1 text-xs text-gray-600">
            {v.cose.map((a) => (
              <li key={`${a.genere}-${a.spItemId}`} className="flex items-center gap-2">
                <Pill text={a.genere === 'bene' ? 'dispositivo' : 'SIM'} tono={a.genere === 'bene' ? 'azzurro' : 'viola'} />
                <span className="font-mono">{a.oggettoEtichetta}</span>
                {a.nomeUtenza && <span className="text-gray-400">{a.nomeUtenza}</span>}
                {a.centroDiCosto?.value && <span className="text-gray-400">· {a.centroDiCosto.value}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/**
 * I due secchi. Non sono errori da nascondere: sono la lista di lavoro.
 * "Da classificare" sono i beni informatici senza tipo — comprati da Acquisti e
 * mai passati per l'area IT; "senza centro di costo" sono le assegnazioni
 * migrate dalle vecchie liste, dove il centro di costo non esisteva.
 */
function DaSistemare({
  daClassificare,
  senzaCentro,
  onBene,
}: {
  daClassificare: BeneInventario[]
  senzaCentro: Assegnazione[]
  onBene: (b: BeneInventario) => void
}) {
  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-xs font-semibold text-gray-700 mb-2">
          Beni informatici senza tipo ({daClassificare.length})
        </h3>
        {daClassificare.length === 0 ? (
          <Vuoto>Niente da classificare.</Vuoto>
        ) : (
          <div className="space-y-2">
            {daClassificare.map((b) => (
              <Classifica key={b.spItemId} bene={b} onBene={onBene} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold text-gray-700 mb-2">
          Assegnazioni attive senza centro di costo ({senzaCentro.length})
        </h3>
        {senzaCentro.length === 0 ? (
          <Vuoto>Tutte le assegnazioni attive hanno un centro di costo.</Vuoto>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {senzaCentro.map((a) => (
              <div key={`${a.genere}-${a.spItemId}`} className="px-3 py-2 text-xs flex flex-wrap gap-2 items-center">
                <Pill text={a.genere === 'bene' ? 'dispositivo' : 'SIM'} tono="neutro" />
                <span className="font-mono text-gray-700">{a.oggettoEtichetta}</span>
                <span className="text-gray-500">
                  {a.assegnatarioNome || a.assegnatarioMail || 'in condivisione'}
                </span>
                {a.servizioLegacy && (
                  <span className="text-gray-400">servizio vecchio: {a.servizioLegacy}</span>
                )}
              </div>
            ))}
            <p className="px-3 py-2 text-[11px] text-gray-400">
              Si assegnano dalla scheda dell’oggetto, con “Correggi” sull’assegnazione attiva.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function Classifica({ bene, onBene }: { bene: BeneInventario; onBene: (b: BeneInventario) => void }) {
  const [tipo, setTipo] = useState('')
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="font-mono font-bold text-gray-700">{bene.numero}</span>
      <span className="text-gray-700 flex-1 min-w-[140px] truncate">{bene.descrizione}</span>
      <select
        value={tipo}
        onChange={(e) => setTipo(e.target.value)}
        className="border border-gray-300 rounded-lg px-2 py-1"
      >
        <option value="">— tipo —</option>
        {TIPI_IT.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button
        disabled={!tipo || busy}
        onClick={async () => {
          setBusy(true)
          setErrore(null)
          try {
            onBene(await salvaDispositivo(bene.spItemId, { tipoIT: tipo }))
          } catch (e: any) {
            setErrore(e.message)
          } finally {
            setBusy(false)
          }
        }}
        className="bg-gray-800 text-white px-3 py-1 rounded-lg font-semibold disabled:opacity-40"
      >
        {busy ? '…' : 'Classifica'}
      </button>
      {errore && <span className="text-red-600">{errore}</span>}
    </div>
  )
}
