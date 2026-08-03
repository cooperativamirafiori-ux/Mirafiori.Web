'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ALIQUOTE_IVA,
  CATEGORIE_SPESA,
  MODALITA_PAGAMENTO,
  STATI_ACQUISTO,
  STATI_APERTI,
  STATO_STILE,
  URGENZA_STILE,
  calcolaTotale,
  dataBreve,
  euro,
  type RichiestaAcquisto,
} from '@/types/acquisti'

interface Props {
  iniziali: RichiestaAcquisto[]
  strutture: Array<{ id: number; label: string }>
  fornitori: string[]
  gestori: string[]
}

const campoCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const oggiYmd = () => new Date().toISOString().slice(0, 10)

export function GestioneAcquisti({ iniziali, strutture, fornitori, gestori }: Props) {
  const router = useRouter()
  const [filtroStato, setFiltroStato] = useState<'aperte' | 'tutte' | string>('aperte')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [query, setQuery] = useState('')
  const [aperta, setAperta] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const visibili = useMemo(() => {
    let l = iniziali
    if (filtroStato === 'aperte') l = l.filter((a) => STATI_APERTI.includes(a.stato))
    else if (filtroStato !== 'tutte') l = l.filter((a) => a.stato === filtroStato)
    if (filtroCategoria) l = l.filter((a) => a.categoria === filtroCategoria)
    const q = query.trim().toLowerCase()
    if (q) {
      l = l.filter((a) =>
        [a.codice, a.descrizione, a.struttura.value, a.richiedenteNome, a.fornitore ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    return l
  }, [iniziali, filtroStato, filtroCategoria, query])

  const conteggi = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of iniziali) c[a.stato] = (c[a.stato] ?? 0) + 1
    return c
  }, [iniziali])

  const speso = useMemo(
    () =>
      iniziali
        .filter((a) => ['Ordinata', 'Consegnata', 'Problema'].includes(a.stato))
        .reduce((s, a) => s + (a.totale ?? 0), 0),
    [iniziali],
  )

  async function azione(spItemId: string, body: Record<string, unknown>) {
    setBusy(true)
    setErrore(null)
    try {
      const res = await fetch(`/api/acquisti/${spItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Operazione non riuscita')
      setAperta(null)
      router.refresh()
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Kpi titolo="Da valutare" valore={(conteggi['Inviata'] ?? 0) + (conteggi['Presa in carico'] ?? 0)} />
        <Kpi titolo="Approvate, da ordinare" valore={conteggi['Approvata'] ?? 0} accento="amber" />
        <Kpi titolo="In attesa di consegna" valore={conteggi['Ordinata'] ?? 0} accento="violet" />
        <Kpi titolo="Problemi aperti" valore={conteggi['Problema'] ?? 0} accento="red" />
      </div>
      <p className="text-xs text-gray-500 px-1">
        Ordinato nel periodo: <strong>{euro(speso)}</strong> · la spesa entra nel cruscotto costi
        alla conferma di consegna.
      </p>

      {/* Filtri */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-wrap gap-2">
        <select
          value={filtroStato}
          onChange={(e) => setFiltroStato(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="aperte">In corso</option>
          <option value="tutte">Tutti gli stati</option>
          {STATI_ACQUISTO.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="">Tutte le categorie</option>
          {CATEGORIE_SPESA.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca codice, articolo, fornitore…"
          className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
        />
      </div>

      {errore && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{errore}</div>}

      {/* Elenco */}
      {visibili.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Nessuna richiesta con questi filtri.
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibili.map((a) => (
            <Riga
              // La chiave include lo stato e il totale: dopo un router.refresh()
              // la riga viene rimontata e il modulo dell'ordine riparte dai dati
              // freschi invece di mostrare quelli digitati prima del salvataggio.
              key={`${a.spItemId}-${a.stato}-${a.totale ?? ''}`}
              a={a}
              aperta={aperta === a.spItemId}
              onToggle={() => setAperta(aperta === a.spItemId ? null : a.spItemId)}
              strutture={strutture}
              fornitori={fornitori}
              gestori={gestori}
              busy={busy}
              onAzione={azione}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Kpi({
  titolo,
  valore,
  accento,
}: {
  titolo: string
  valore: number
  accento?: 'amber' | 'violet' | 'red'
}) {
  const colore =
    accento === 'amber'
      ? 'text-amber-600'
      : accento === 'violet'
        ? 'text-violet-600'
        : accento === 'red'
          ? 'text-red-600'
          : 'text-gray-800'
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-3.5 py-3">
      <p className={`text-2xl font-bold ${colore}`}>{valore}</p>
      <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{titolo}</p>
    </div>
  )
}

function Riga({
  a,
  aperta,
  onToggle,
  strutture,
  fornitori,
  gestori,
  busy,
  onAzione,
}: {
  a: RichiestaAcquisto
  aperta: boolean
  onToggle: () => void
  strutture: Array<{ id: number; label: string }>
  fornitori: string[]
  gestori: string[]
  busy: boolean
  onAzione: (spItemId: string, body: Record<string, unknown>) => Promise<void>
}) {
  const stile = STATO_STILE[a.stato] ?? STATO_STILE['Inviata']

  const [motivo, setMotivo] = useState('')
  const [ordine, setOrdine] = useState({
    fornitore: a.fornitore ?? '',
    imponibile: a.imponibile != null ? String(a.imponibile) : '',
    aliquotaIva: String(a.aliquotaIva ?? 22),
    dataOrdine: a.dataOrdine?.slice(0, 10) || oggiYmd(),
    pagamento: a.pagamento ?? 'Fattura posticipata',
    dataConsegnaPrevista: a.dataConsegnaPrevista?.slice(0, 10) ?? '',
    luogoConsegnaId: String(a.luogoConsegna?.id ?? a.struttura.id),
    daInventariare: a.daInventariare,
    marcaModello: a.marcaModello ?? '',
    numeroSerie: a.numeroSerie ?? '',
    extraCee: a.extraCee,
  })
  const set = (k: keyof typeof ordine, v: string | boolean) =>
    setOrdine((o) => ({ ...o, [k]: v }))

  const imponibileNum = Number(ordine.imponibile) || 0
  const aliquotaNum = ordine.extraCee ? 0 : Number(ordine.aliquotaIva) || 0
  const totale = calcolaTotale(imponibileNum, aliquotaNum)

  const puoValutare = ['Inviata', 'Presa in carico'].includes(a.stato)
  const puoOrdinare = ['Approvata', 'Presa in carico', 'Ordinata'].includes(a.stato)

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50"
      >
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${stile.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-gray-600">{a.codice}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${stile.badge}`}>
              {a.stato}
            </span>
            {a.urgenza !== 'Normale' && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${URGENZA_STILE[a.urgenza] ?? ''}`}>
                {a.urgenza}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-800 font-medium mt-1 truncate">
            {a.descrizione}
            {a.quantita > 1 && <span className="text-gray-400"> ×{a.quantita}</span>}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {a.richiedenteNome} · {a.struttura.value} · {a.categoria}
            {a.totale ? ` · ${euro(a.totale)}` : ''}
          </p>
        </div>
        <span className="text-gray-300 text-sm shrink-0">{aperta ? '▲' : '▼'}</span>
      </button>

      {aperta && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50/50">
          {/* Dettagli della richiesta */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <Voce t="Richiesta il" v={dataBreve(a.dataRichiesta)} />
            <Voce t="Serve entro" v={a.serveEntro ? dataBreve(a.serveEntro) : '—'} />
            <Voce t="Assegnata a" v={a.assegnatoNome ?? 'nessuno'} />
            <Voce t="Quantità" v={String(a.quantita)} />
            {a.link && (
              <div className="col-span-2">
                <dt className="text-gray-500">Link</dt>
                <dd>
                  <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-brand-orange underline break-all">
                    {a.link}
                  </a>
                </dd>
              </div>
            )}
            {a.motivoRifiuto && <Voce t="Motivo" v={a.motivoRifiuto} span />}
            {a.esitoConsegna && <Voce t="Esito consegna" v={a.esitoConsegna} />}
            {a.noteEsito && <Voce t="Note esito" v={a.noteEsito} span />}
          </dl>

          {/* Presa in carico */}
          {a.stato === 'Inviata' && (
            <button
              disabled={busy}
              onClick={() => onAzione(a.spItemId, { azione: 'prendi-in-carico' })}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              Prendi in carico
            </button>
          )}

          {/* Riassegnazione */}
          {STATI_APERTI.includes(a.stato) && gestori.length > 1 && (
            <div>
              <label className={labelCls}>Assegna a</label>
              <select
                defaultValue=""
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) {
                    onAzione(a.spItemId, { azione: 'assegna', assegnatoEmail: e.target.value })
                  }
                }}
                className={campoCls}
              >
                <option value="">— scegli un gestore —</option>
                {gestori.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Valutazione */}
          {puoValutare && (
            <div className="space-y-2 bg-white rounded-lg border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-700">Valutazione</p>
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => onAzione(a.spItemId, { azione: 'approva' })}
                  className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  Approva
                </button>
                <button
                  disabled={busy || !motivo.trim()}
                  onClick={() => onAzione(a.spItemId, { azione: 'rifiuta', motivo })}
                  className="flex-1 border border-red-300 text-red-700 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                  title={motivo.trim() ? '' : 'Indica prima il motivo'}
                >
                  Non approvare
                </button>
              </div>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo del rifiuto (obbligatorio per non approvare)"
                className={campoCls}
              />
            </div>
          )}

          {/* Ordine */}
          {puoOrdinare && (
            <div className="space-y-3 bg-white rounded-lg border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-700">
                {a.stato === 'Ordinata' ? 'Correggi l’ordine' : 'Registra l’ordine'}
              </p>

              <div>
                <label className={labelCls}>Fornitore *</label>
                <input
                  list={`fornitori-${a.spItemId}`}
                  value={ordine.fornitore}
                  onChange={(e) => set('fornitore', e.target.value)}
                  className={campoCls}
                  placeholder="Inizia a scrivere: propone quelli già usati"
                />
                <datalist id={`fornitori-${a.spItemId}`}>
                  {fornitori.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>Imponibile € *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ordine.imponibile}
                    onChange={(e) => set('imponibile', e.target.value)}
                    className={campoCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>IVA %</label>
                  <select
                    value={ordine.aliquotaIva}
                    onChange={(e) => set('aliquotaIva', e.target.value)}
                    disabled={ordine.extraCee}
                    className={`${campoCls} disabled:bg-gray-100`}
                  >
                    {ALIQUOTE_IVA.map((v) => (
                      <option key={v} value={v}>
                        {v}%
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Totale</label>
                  <div className="px-3 py-2 text-sm font-semibold text-gray-800 bg-gray-100 rounded-lg">
                    {euro(totale)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Data ordine</label>
                  <input
                    type="date"
                    value={ordine.dataOrdine}
                    onChange={(e) => set('dataOrdine', e.target.value)}
                    className={campoCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Consegna prevista</label>
                  <input
                    type="date"
                    value={ordine.dataConsegnaPrevista}
                    onChange={(e) => set('dataConsegnaPrevista', e.target.value)}
                    className={campoCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Pagamento</label>
                  <select
                    value={ordine.pagamento}
                    onChange={(e) => set('pagamento', e.target.value)}
                    className={campoCls}
                  >
                    {MODALITA_PAGAMENTO.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Luogo di consegna</label>
                  <select
                    value={ordine.luogoConsegnaId}
                    onChange={(e) => set('luogoConsegnaId', e.target.value)}
                    className={campoCls}
                  >
                    {strutture.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={ordine.extraCee}
                    onChange={(e) => set('extraCee', e.target.checked)}
                  />
                  Acquisto extra CEE (IVA a 0)
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={ordine.daInventariare}
                    onChange={(e) => set('daInventariare', e.target.checked)}
                  />
                  Da inventariare
                </label>
              </div>

              {ordine.daInventariare && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Marca e modello *</label>
                    <input
                      value={ordine.marcaModello}
                      onChange={(e) => set('marcaModello', e.target.value)}
                      className={campoCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Numero di serie</label>
                    <input
                      value={ordine.numeroSerie}
                      onChange={(e) => set('numeroSerie', e.target.value)}
                      className={campoCls}
                    />
                  </div>
                </div>
              )}

              <button
                disabled={busy || !ordine.fornitore.trim() || imponibileNum <= 0}
                onClick={() =>
                  onAzione(a.spItemId, {
                    azione: 'ordina',
                    fornitore: ordine.fornitore,
                    imponibile: imponibileNum,
                    aliquotaIva: aliquotaNum,
                    dataOrdine: ordine.dataOrdine,
                    pagamento: ordine.pagamento,
                    dataConsegnaPrevista: ordine.dataConsegnaPrevista || undefined,
                    luogoConsegnaId: Number(ordine.luogoConsegnaId),
                    daInventariare: ordine.daInventariare,
                    marcaModello: ordine.marcaModello,
                    numeroSerie: ordine.numeroSerie,
                    extraCee: ordine.extraCee,
                  })
                }
                className="w-full bg-violet-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              >
                {a.stato === 'Ordinata' ? 'Aggiorna l’ordine' : 'Registra ordine e avvisa il richiedente'}
              </button>
            </div>
          )}

          {/* Problema da risolvere */}
          {a.stato === 'Problema' && (
            <div className="space-y-2 bg-white rounded-lg border border-red-100 p-3">
              <p className="text-xs font-semibold text-red-700">
                Problema segnalato: {a.esitoConsegna}
              </p>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Come è stato risolto (facoltativo)"
                className={campoCls}
              />
              <button
                disabled={busy}
                onClick={() => onAzione(a.spItemId, { azione: 'risolvi', noteEsito: motivo })}
                className="w-full bg-emerald-600 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                Risolto — chiudi e registra il costo
              </button>
            </div>
          )}

          {/* Annullamento */}
          {!['Consegnata', 'Annullata', 'Non approvata'].includes(a.stato) && (
            <button
              disabled={busy}
              onClick={() => {
                if (confirm(`Annullare ${a.codice}?`)) {
                  onAzione(a.spItemId, { azione: 'annulla', motivo: motivo || undefined })
                }
              }}
              className="w-full text-xs text-gray-400 hover:text-red-600 py-1 disabled:opacity-50"
            >
              Annulla richiesta
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Voce({ t, v, span }: { t: string; v: string; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : undefined}>
      <dt className="text-gray-500">{t}</dt>
      <dd className="text-gray-800 font-medium whitespace-pre-wrap">{v}</dd>
    </div>
  )
}
