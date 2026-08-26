'use client'

/**
 * Registro dei beni: elenco filtrabile e scheda completa di ciascuno.
 *
 * La scheda mostra *tutti* i campi della lista SharePoint, divisi in due parti:
 * quelli che arrivano dalla richiesta di acquisto, in sola lettura, e i pochi
 * che riguardano la vita successiva del bene, modificabili qui.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Kpi } from '@/components/ui/Kpi'
import { Voce } from '@/components/ui/Voce'
import {
  GARANZIA_STILE,
  dataBreve,
  etichettaGaranzia,
  euro,
  statoGaranzia,
} from '@/types/acquisti'
import {
  STATI_BENE,
  STATO_BENE_STILE,
  STATI_BENE_CHIUSI,
  type BeneInventario,
  type StatoBene,
} from '@/types/inventario'
import type { Assegnazione } from '@/types/it'

interface Props {
  iniziali: BeneInventario[]
  strutture: Array<{ id: number; label: string }>
  /**
   * Tutte le assegnazioni dei beni, per lo storico nella scheda. Qui è in sola
   * lettura: si assegna e si restituisce dall'area IT e Dispositivi. Ma questo
   * resta il posto dove la cronologia si legge anche per un bene dismesso, che
   * dall'area IT è sparito.
   */
  assegnazioni?: Assegnazione[]
}

const campoCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

type FiltroGaranzia = 'tutte' | 'attiva' | 'in-scadenza' | 'scaduta'

export function InventarioBeni({ iniziali, strutture, assegnazioni = [] }: Props) {
  const [beni, setBeni] = useState(iniziali)
  const [filtroStato, setFiltroStato] = useState<'in-uso' | 'tutti' | string>('in-uso')
  const [filtroStruttura, setFiltroStruttura] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroGaranzia, setFiltroGaranzia] = useState<FiltroGaranzia>('tutte')
  const [query, setQuery] = useState('')
  const [apertoId, setApertoId] = useState<string | null>(null)

  const categorie = useMemo(
    () => [...new Set(beni.map((b) => b.categoria).filter(Boolean))].sort() as string[],
    [beni],
  )

  const visibili = useMemo(() => {
    let l = beni
    if (filtroStato === 'in-uso') l = l.filter((b) => !STATI_BENE_CHIUSI.includes(b.statoBene))
    else if (filtroStato !== 'tutti') l = l.filter((b) => b.statoBene === filtroStato)
    if (filtroStruttura) l = l.filter((b) => String(b.struttura?.id ?? '') === filtroStruttura)
    if (filtroCategoria) l = l.filter((b) => b.categoria === filtroCategoria)
    if (filtroGaranzia !== 'tutte') {
      l = l.filter((b) => statoGaranzia(b.scadenzaGaranzia).stato === filtroGaranzia)
    }
    const q = query.trim().toLowerCase()
    if (q) {
      l = l.filter((b) =>
        [
          b.numero,
          b.descrizione,
          b.marcaModello ?? '',
          b.numeroSerie ?? '',
          b.fornitore ?? '',
          b.ubicazione ?? '',
          b.struttura?.value ?? '',
          b.codiceRichiesta ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    return l
  }, [beni, filtroStato, filtroStruttura, filtroCategoria, filtroGaranzia, query])

  // I totali seguono i filtri: "quanto valgono i beni di questa struttura" è la
  // domanda che si fa davvero, e cambia con l'elenco che si sta guardando.
  const valore = useMemo(() => visibili.reduce((s, b) => s + (b.valore ?? 0), 0), [visibili])
  const inGaranzia = useMemo(
    () => visibili.filter((b) => statoGaranzia(b.scadenzaGaranzia).stato === 'attiva').length,
    [visibili],
  )
  const inScadenza = useMemo(
    () => visibili.filter((b) => statoGaranzia(b.scadenzaGaranzia).stato === 'in-scadenza').length,
    [visibili],
  )

  const aggiorna = (b: BeneInventario) =>
    setBeni((l) => l.map((x) => (x.spItemId === b.spItemId ? b : x)))

  return (
    <div className="space-y-4">
      {/* Riepilogo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Kpi titolo="Beni elencati" valore={String(visibili.length)} />
        <Kpi titolo="Valore" valore={euro(valore)} />
        <Kpi titolo="In garanzia" valore={String(inGaranzia)} accento="emerald" />
        <Kpi titolo="Garanzia in scadenza" valore={String(inScadenza)} accento="amber" />
      </div>

      {/* Filtri */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-wrap gap-2">
        <select
          value={filtroStato}
          onChange={(e) => setFiltroStato(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="in-uso">In patrimonio</option>
          <option value="tutti">Tutti gli stati</option>
          {STATI_BENE.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filtroStruttura}
          onChange={(e) => setFiltroStruttura(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="">Tutte le strutture</option>
          {strutture.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="">Tutte le categorie</option>
          {categorie.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filtroGaranzia}
          onChange={(e) => setFiltroGaranzia(e.target.value as FiltroGaranzia)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="tutte">Garanzia: tutte</option>
          <option value="attiva">In garanzia</option>
          <option value="in-scadenza">In scadenza</option>
          <option value="scaduta">Scaduta</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca numero, seriale, marca, fornitore…"
          className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
        />
      </div>

      {visibili.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          {beni.length === 0
            ? 'Nessun bene in inventario: il primo nasce registrando un ordine con “da inventariare”.'
            : 'Nessun bene con questi filtri.'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibili.map((b) => (
            <Scheda
              key={b.spItemId}
              b={b}
              aperta={apertoId === b.spItemId}
              onToggle={() => setApertoId(apertoId === b.spItemId ? null : b.spItemId)}
              strutture={strutture}
              onAggiornato={aggiorna}
              storico={assegnazioni.filter((a) => a.oggettoId === Number(b.spItemId))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Chi ha avuto il bene, dalla volta più recente. In sola lettura: assegnare e
 * restituire si fa dall'area IT e Dispositivi, che sa anche cosa cambiare
 * sull'anagrafica. Qui la cronologia c'è perché questo è il registro, e un bene
 * dismesso — che dall'area IT è sparito — la sua storia la conserva qui.
 */
function Storico({ righe }: { righe: Assegnazione[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-3">
      <p className="text-xs font-semibold text-gray-700 mb-2">Chi l’ha avuto</p>
      <ul className="space-y-1.5 text-xs">
        {righe.map((a) => (
          <li key={a.spItemId} className="flex flex-wrap items-baseline gap-x-2">
            <span className={a.stato === 'Attiva' ? 'font-semibold text-gray-800' : 'text-gray-700'}>
              {a.assegnatarioNome || a.assegnatarioMail || 'in condivisione'}
            </span>
            <span className="text-gray-500">
              dal {dataBreve(a.dataAssegnazione)}
              {a.dataFine ? ` al ${dataBreve(a.dataFine)}` : a.stato === 'Attiva' ? ' · in corso' : ''}
            </span>
            {a.centroDiCosto?.value && <span className="text-gray-400">{a.centroDiCosto.value}</span>}
            {a.nomeUtenza && <span className="text-gray-400">{a.nomeUtenza}</span>}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-gray-400 mt-2">
        Le assegnazioni si gestiscono in IT e Dispositivi.
      </p>
    </div>
  )
}

function Scheda({
  b,
  aperta,
  onToggle,
  strutture,
  onAggiornato,
  storico = [],
}: {
  b: BeneInventario
  aperta: boolean
  onToggle: () => void
  strutture: Array<{ id: number; label: string }>
  onAggiornato: (b: BeneInventario) => void
  storico?: Assegnazione[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [salvato, setSalvato] = useState(false)

  const [vita, setVita] = useState({
    statoBene: b.statoBene as StatoBene,
    ubicazione: b.ubicazione ?? '',
    strutturaId: String(b.struttura?.id ?? ''),
    dataDismissione: b.dataDismissione?.slice(0, 10) ?? '',
    note: b.note ?? '',
  })
  const set = (k: keyof typeof vita, v: string) => {
    setVita((s) => ({ ...s, [k]: v }))
    setSalvato(false)
  }

  const garanzia = statoGaranzia(b.scadenzaGaranzia)
  const esce = STATI_BENE_CHIUSI.includes(vita.statoBene)

  const modificato =
    vita.statoBene !== b.statoBene ||
    vita.ubicazione !== (b.ubicazione ?? '') ||
    vita.strutturaId !== String(b.struttura?.id ?? '') ||
    vita.dataDismissione !== (b.dataDismissione?.slice(0, 10) ?? '') ||
    vita.note !== (b.note ?? '')

  async function salva() {
    setBusy(true)
    setErrore(null)
    try {
      const res = await fetch(`/api/inventario/${b.spItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statoBene: vita.statoBene,
          ubicazione: vita.ubicazione,
          strutturaId: Number(vita.strutturaId) || undefined,
          // Stringa vuota = azzera la data; undefined la lascerebbe com'è.
          dataDismissione: vita.dataDismissione || null,
          note: vita.note,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Salvataggio non riuscito')
      onAggiornato(data.bene)
      setVita((s) => ({
        ...s,
        statoBene: data.bene.statoBene,
        dataDismissione: data.bene.dataDismissione?.slice(0, 10) ?? '',
      }))
      setSalvato(true)
      router.refresh()
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-gray-700">{b.numero}</span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                STATO_BENE_STILE[b.statoBene] ?? ''
              }`}
            >
              {b.statoBene}
            </span>
            {b.scadenzaGaranzia && garanzia.stato !== 'scaduta' && (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  GARANZIA_STILE[garanzia.stato]
                }`}
              >
                {garanzia.stato === 'attiva' ? 'in garanzia' : 'garanzia in scadenza'}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-800 font-medium mt-1 truncate">{b.descrizione}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {[b.marcaModello, b.struttura?.value, b.ubicazione].filter(Boolean).join(' · ') || '—'}
            {b.valore ? ` · ${euro(b.valore)}` : ''}
          </p>
        </div>
        <span className="text-gray-300 text-sm shrink-0">{aperta ? '▲' : '▼'}</span>
      </button>

      {aperta && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50/50">
          {/* Dall'acquisto: sola lettura */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">Dati dell’acquisto</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <Voce t="Numero di inventario" v={b.numero} />
              <Voce t="Categoria" v={b.categoria ?? '—'} />
              <Voce t="Marca e modello" v={b.marcaModello ?? '—'} />
              <Voce t="Numero di serie" v={b.numeroSerie ?? '—'} />
              <Voce t="Data di acquisto" v={dataBreve(b.dataAcquisto)} />
              <Voce t="Fornitore" v={b.fornitore ?? '—'} />
              <Voce t="Valore" v={b.valore != null ? euro(b.valore) : '—'} />
              <Voce t="Garanzia" v={b.mesiGaranzia ? `${b.mesiGaranzia} mesi` : '—'} />
              <Voce
                t="Scadenza garanzia"
                v={b.scadenzaGaranzia ? etichettaGaranzia(b.scadenzaGaranzia) : '—'}
                span
              />
              <Voce t="Richiesta di origine" v={b.codiceRichiesta ?? '—'} />
              <Voce t="Descrizione" v={b.descrizione || '—'} span />
            </dl>
            <p className="text-[11px] text-gray-400 mt-1.5">
              Questi campi vengono dalla richiesta di acquisto: per correggerli si corregge
              l’ordine, e i beni si riallineano.
            </p>
          </div>

          {/* Documenti */}
          <div className="flex flex-wrap gap-2 text-xs">
            {b.cartellaUrl && (
              <a
                href={b.cartellaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-white"
              >
                📁 cartella del bene
              </a>
            )}
            {b.fatturaUrl ? (
              <a
                href={b.fatturaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                🧾 {b.fatturaNome ?? 'fattura'}
              </a>
            ) : (
              <span className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-400">
                fattura non caricata
              </span>
            )}
            {b.garanziaUrl ? (
              <a
                href={b.garanziaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                📄 {b.garanziaNome ?? 'garanzia'}
              </a>
            ) : (
              <span className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-400">
                garanzia non caricata
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">
            I documenti si caricano dalla richiesta di acquisto, in Gestione acquisti.
          </p>

          {storico.length > 0 && <Storico righe={storico} />}

          {/* Vita del bene: modificabile */}
          <div className="space-y-2.5 bg-white rounded-lg border border-gray-100 p-3">
            <p className="text-xs font-semibold text-gray-700">Dove sta e come sta</p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Stato del bene</label>
                <select
                  value={vita.statoBene}
                  onChange={(e) => set('statoBene', e.target.value)}
                  className={campoCls}
                >
                  {STATI_BENE.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Struttura</label>
                <select
                  value={vita.strutturaId}
                  onChange={(e) => set('strutturaId', e.target.value)}
                  className={campoCls}
                >
                  <option value="">— nessuna —</option>
                  {strutture.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Ubicazione</label>
                <input
                  value={vita.ubicazione}
                  onChange={(e) => set('ubicazione', e.target.value)}
                  placeholder="stanza, reparto, armadio…"
                  className={campoCls}
                />
              </div>
              <div>
                <label className={labelCls}>Data di dismissione</label>
                <input
                  type="date"
                  value={vita.dataDismissione}
                  onChange={(e) => set('dataDismissione', e.target.value)}
                  className={campoCls}
                />
              </div>
            </div>

            {esce && !vita.dataDismissione && (
              <p className="text-xs text-amber-700">
                Stato di uscita senza data: al salvataggio viene messa la data di oggi.
              </p>
            )}

            <div>
              <label className={labelCls}>Note</label>
              <textarea
                value={vita.note}
                onChange={(e) => set('note', e.target.value)}
                rows={2}
                className={campoCls}
              />
            </div>

            {errore && <p className="text-xs text-red-600">{errore}</p>}

            <button
              disabled={busy || !modificato}
              onClick={salva}
              className="w-full bg-gray-800 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
            >
              {busy ? 'Salvo…' : salvato && !modificato ? 'Salvato ✓' : 'Salva'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
