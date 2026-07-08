'use client'

import { useMemo, useState } from 'react'
import {
  RU_CONFIG,
  STATO_RAPPORTO_STILE,
  type RUEntity,
  type RUField,
  type RURecord,
} from '@/types/risorse-umane'
import { CartellaDipendente } from './CartellaDipendente'

interface Props {
  entity: RUEntity
  iniziali: RURecord[]
}

const inputCls =
  'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400'
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1'

const euro = (n: number) =>
  `€ ${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function toFormValue(v: RURecord[string]): string {
  if (v == null) return ''
  return String(v)
}

function formInizialeDa(record: RURecord | null, fields: readonly RUField[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields) out[f.key] = record ? toFormValue(record[f.key]) : ''
  return out
}

function nomeCompleto(r: RURecord): string {
  const n = `${r.Cognome ?? ''} ${r.Nome ?? ''}`.trim()
  return n || (r.Title as string) || '—'
}

function formatValore(field: RUField, value: RURecord[string]): string {
  if (value == null || value === '') return ''
  if (field.type === 'date') {
    const s = String(value).slice(0, 10)
    const d = new Date(`${s}T00:00:00`)
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('it-IT')
  }
  if (field.type === 'currency') {
    const n = Number(value)
    return Number.isFinite(n) ? euro(n) : String(value)
  }
  return String(value)
}

const SOGLIA_FULL_TIME = 38

/** Full Time se ore >= 38, Part Time se inferiori; null se non compilato. */
function regimeOrario(r: RURecord): 'Full Time' | 'Part Time' | null {
  const raw = r.OreLavoroPreviste
  if (raw == null || raw === '') return null
  const ore = Number(raw)
  if (!Number.isFinite(ore)) return null
  return ore >= SOGLIA_FULL_TIME ? 'Full Time' : 'Part Time'
}

// ------------------------------------------------------------------
// Segnalini (badge) dell'elenco dipendenti — un colore per categoria
// ------------------------------------------------------------------
const PILL = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap'
const PILL_DEFAULT = 'bg-gray-100 text-gray-700 border-gray-200'

const COOP_STILE: Record<string, string> = {
  'Tipo A': 'bg-teal-100 text-teal-800 border-teal-200',
  'Tipo B': 'bg-amber-100 text-amber-800 border-amber-200',
}
const REGIME_STILE: Record<string, string> = {
  'Full Time': 'bg-sky-100 text-sky-800 border-sky-200',
  'Part Time': 'bg-indigo-100 text-indigo-800 border-indigo-200',
}
const SOCIO_STILE: Record<string, string> = {
  Si: 'bg-rose-100 text-rose-800 border-rose-200',
  No: 'bg-slate-100 text-slate-600 border-slate-200',
}
const QUALIFICA_CLS = 'bg-violet-100 text-violet-800 border-violet-200'
const MANSIONE_CLS = 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200'

/** Pillola generica colorata (con eventuale pallino). */
function Pill({ text, cls, dot }: { text: string; cls: string; dot?: string }) {
  return (
    <span className={`${PILL} ${cls}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {text}
    </span>
  )
}

const val = (v: RURecord[string]): string => (v == null ? '' : String(v).trim())

interface BadgeDesc {
  key: string
  text: string
  cls: string
  dot?: string
}

/** I 6 segnalini di un dipendente, in ordine: Coop, Full/Part, Socio, Qualifica, Mansione, Stato. */
function badgesDipendente(r: RURecord): BadgeDesc[] {
  const out: BadgeDesc[] = []

  const coop = val(r.AreaAssunzione)
  if (coop) {
    out.push({
      key: 'coop',
      text: coop === 'Tipo A' ? 'Coop A' : coop === 'Tipo B' ? 'Coop B' : coop,
      cls: COOP_STILE[coop] ?? PILL_DEFAULT,
    })
  }

  const regime = regimeOrario(r)
  if (regime) out.push({ key: 'regime', text: regime, cls: REGIME_STILE[regime] })

  const socio = val(r.Socio)
  if (socio) {
    out.push({
      key: 'socio',
      text: socio === 'Si' ? 'Socio' : 'Non socio',
      cls: SOCIO_STILE[socio] ?? PILL_DEFAULT,
    })
  }

  const qualifica = val(r.Qualifica)
  if (qualifica) out.push({ key: 'qualifica', text: qualifica, cls: QUALIFICA_CLS })

  const mansione = val(r.Mansione)
  if (mansione) out.push({ key: 'mansione', text: mansione, cls: MANSIONE_CLS })

  const stato = val(r.StatoRapporto)
  if (stato) {
    const s = STATO_RAPPORTO_STILE[stato]
    out.push({ key: 'stato', text: stato, cls: s?.badge ?? PILL_DEFAULT, dot: s?.dot ?? 'bg-gray-400' })
  }

  return out
}

/** Opzioni di ordinamento dell'elenco dipendenti. */
const SORT_OPZIONI: { key: string; label: string; get: (r: RURecord) => string }[] = [
  { key: 'nome', label: 'Nome (A→Z)', get: nomeCompleto },
  { key: 'mansione', label: 'Mansione', get: (r) => val(r.Mansione) },
  { key: 'qualifica', label: 'Qualifica', get: (r) => val(r.Qualifica) },
  { key: 'coop', label: 'Coop A/B', get: (r) => val(r.AreaAssunzione) },
  { key: 'regime', label: 'Full/Part Time', get: (r) => regimeOrario(r) ?? '' },
  { key: 'socio', label: 'Socio', get: (r) => val(r.Socio) },
  { key: 'stato', label: 'Stato rapporto', get: (r) => val(r.StatoRapporto) },
]

/** Ordina i record secondo la chiave scelta; valori vuoti in fondo, nome come spareggio. */
function ordina(records: RURecord[], sortKey: string): RURecord[] {
  const opt = SORT_OPZIONI.find((o) => o.key === sortKey) ?? SORT_OPZIONI[0]
  return [...records].sort((a, b) => {
    const va = opt.get(a)
    const vb = opt.get(b)
    if (va !== vb) {
      if (!va) return 1
      if (!vb) return -1
      const c = va.localeCompare(vb, 'it')
      if (c !== 0) return c
    }
    return nomeCompleto(a).localeCompare(nomeCompleto(b), 'it')
  })
}

/** Ordine e raggruppamento delle sezioni preservando l'ordine di comparsa. */
function sezioni(fields: readonly RUField[]): { nome: string; campi: RUField[] }[] {
  const map = new Map<string, RUField[]>()
  for (const f of fields) {
    const s = f.section ?? 'Dati'
    if (!map.has(s)) map.set(s, [])
    map.get(s)!.push(f)
  }
  return Array.from(map.entries()).map(([nome, campi]) => ({ nome, campi }))
}

export function GestioneRU({ entity, iniziali }: Props) {
  const config = RU_CONFIG[entity]
  const fields = config.fields
  const [lista, setLista] = useState<RURecord[]>(iniziali)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('nome')
  const [dettaglio, setDettaglio] = useState<RURecord | null>(null)
  const [formAperto, setFormAperto] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>(() => formInizialeDa(null, fields))
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const isDip = entity === 'dipendenti'

  // Nel sottotitolo escludo Cognome/Nome e — per i dipendenti — Mansione (ora è un badge).
  const inListFields = useMemo(
    () =>
      fields.filter(
        (f) => f.inList && f.key !== 'Cognome' && f.key !== 'Nome' && !(isDip && f.key === 'Mansione'),
      ),
    [fields, isDip],
  )

  // Per la ricerca includo comunque tutti i campi in elenco (anche Mansione).
  const searchFields = useMemo(
    () => fields.filter((f) => f.inList && f.key !== 'Cognome' && f.key !== 'Nome'),
    [fields],
  )

  const listaFiltrata = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = [...lista].sort((a, b) => nomeCompleto(a).localeCompare(nomeCompleto(b)))
    if (!q) return base
    return base.filter((r) => {
      const hay = [nomeCompleto(r), ...searchFields.map((f) => String(r[f.key] ?? ''))]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [lista, query, searchFields])

  const ordinati = useMemo(
    () => (isDip ? ordina(listaFiltrata, sortKey) : listaFiltrata),
    [listaFiltrata, sortKey, isDip],
  )

  function set(k: string, v: string) {
    setForm((p) => ({ ...p, [k]: v }))
  }

  function apriNuovo() {
    setEditId(null)
    setForm(formInizialeDa(null, fields))
    setErrore(null)
    setDettaglio(null)
    setFormAperto(true)
  }

  function apriModifica(r: RURecord) {
    setEditId(r.spItemId)
    setForm(formInizialeDa(r, fields))
    setErrore(null)
    setFormAperto(true)
  }

  function chiudiForm() {
    setFormAperto(false)
    setEditId(null)
    setForm(formInizialeDa(null, fields))
    setErrore(null)
  }

  async function salva() {
    if (busy) return
    if (!form.Cognome?.trim() || !form.Nome?.trim()) {
      setErrore('Cognome e Nome sono obbligatori.')
      return
    }
    setBusy(true)
    setErrore(null)
    try {
      const url = editId
        ? `/api/risorse-umane/${entity}/${editId}`
        : `/api/risorse-umane/${entity}`
      const res = await fetch(url, {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Errore salvataggio')
      const { item } = await res.json()
      setLista((prev) =>
        editId ? prev.map((r) => (r.spItemId === editId ? item : r)) : [item, ...prev],
      )
      if (dettaglio && editId === dettaglio.spItemId) setDettaglio(item)
      chiudiForm()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(false)
    }
  }

  async function elimina(r: RURecord) {
    if (busy) return
    if (!confirm(`Eliminare "${nomeCompleto(r)}"? L'operazione non è reversibile.`)) return
    setBusy(true)
    setErrore(null)
    try {
      const res = await fetch(`/api/risorse-umane/${entity}/${r.spItemId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Errore eliminazione')
      setLista((prev) => prev.filter((x) => x.spItemId !== r.spItemId))
      if (dettaglio?.spItemId === r.spItemId) setDettaglio(null)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(false)
    }
  }

  // ---------------- FORM ----------------
  if (formAperto) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800">
            {editId ? `Modifica ${config.singolare.toLowerCase()}` : `Nuovo ${config.singolare.toLowerCase()}`}
          </h3>
          <button onClick={chiudiForm} className="text-sm text-gray-500 hover:text-gray-700">
            ← Annulla
          </button>
        </div>

        {errore && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {errore}
          </div>
        )}

        {sezioni(fields).map(({ nome, campi }) => (
          <fieldset key={nome} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <legend className="px-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
              {nome}
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {campi.map((f) => (
                <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <label className={labelCls}>
                    {f.label}
                    {(f.key === 'Cognome' || f.key === 'Nome') && <span className="text-red-500"> *</span>}
                  </label>
                  <CampoInput field={f} value={form[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
                </div>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="flex gap-3">
          <button
            onClick={salva}
            disabled={busy}
            className="bg-emerald-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {busy ? 'Salvataggio…' : 'Salva'}
          </button>
          <button
            onClick={chiudiForm}
            disabled={busy}
            className="text-sm text-gray-600 px-4 py-2.5 rounded-xl hover:bg-gray-100"
          >
            Annulla
          </button>
        </div>
      </div>
    )
  }

  // ---------------- DETTAGLIO ----------------
  if (dettaglio) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <button onClick={() => setDettaglio(null)} className="text-sm text-gray-500 hover:text-gray-700">
            ← Torna all&apos;elenco
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => apriModifica(dettaglio)}
              className="text-sm font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-xl hover:bg-emerald-100"
            >
              Modifica
            </button>
            <button
              onClick={() => elimina(dettaglio)}
              className="text-sm font-semibold text-red-600 border border-red-200 bg-red-50 px-3 py-1.5 rounded-xl hover:bg-red-100"
            >
              Elimina
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-bold text-gray-800">{nomeCompleto(dettaglio)}</h3>
          {entity === 'dipendenti' && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {badgesDipendente(dettaglio).map((b) => (
                <Pill key={b.key} text={b.text} cls={b.cls} dot={b.dot} />
              ))}
            </div>
          )}
          {dettaglio.IdAccess != null && (
            <span className="text-xs text-gray-400">Rif. archivio #{String(dettaglio.IdAccess)}</span>
          )}
        </div>

        {errore && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {errore}
          </div>
        )}

        {entity === 'dipendenti' && <CartellaDipendente spItemId={dettaglio.spItemId} />}

        {sezioni(fields).map(({ nome, campi }) => {
          const visibili = campi.filter((f) => formatValore(f, dettaglio[f.key]) !== '')
          if (!visibili.length) return null
          return (
            <div key={nome} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <h4 className="text-xs font-bold uppercase tracking-wide text-emerald-700 mb-3">{nome}</h4>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {visibili.map((f) => (
                  <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                    <dt className="text-xs text-gray-500">{f.label}</dt>
                    <dd className="text-sm text-gray-800 whitespace-pre-wrap">
                      {formatValore(f, dettaglio[f.key])}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })}
      </div>
    )
  }

  // ---------------- ELENCO ----------------

  function riga(r: RURecord) {
    const badges = isDip ? badgesDipendente(r) : []
    const sottotitolo = inListFields
      .map((f) => formatValore(f, r[f.key]))
      .filter(Boolean)
      .join(' · ')
    return (
      <li key={r.spItemId}>
        <button
          onClick={() => setDettaglio(r)}
          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start justify-between gap-3"
        >
          <div className="min-w-0 shrink-0 max-w-[40%]">
            <div className="font-semibold text-gray-800 truncate">{nomeCompleto(r)}</div>
            {sottotitolo && <div className="text-xs text-gray-500 truncate">{sottotitolo}</div>}
          </div>
          {badges.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0">
              {badges.map((b) => (
                <Pill key={b.key} text={b.text} cls={b.cls} dot={b.dot} />
              ))}
              <span className="text-gray-300 self-center">›</span>
            </div>
          ) : (
            <span className="text-gray-300 shrink-0 self-center">›</span>
          )}
        </button>
      </li>
    )
  }

  const elencoUl = (records: RURecord[]) => (
    <ul className="divide-y divide-gray-100 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {records.map(riga)}
    </ul>
  )

  const inForza = isDip ? ordinati.filter((r) => String(r.StatoRapporto ?? '') !== 'Cessato') : []
  const cessati = isDip ? ordinati.filter((r) => String(r.StatoRapporto ?? '') === 'Cessato') : []

  const sezioneElenco = (titolo: string, records: RURecord[], dot: string) =>
    records.length === 0 ? null : (
      <div className="space-y-2">
        <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {titolo} <span className="text-gray-400 font-normal">({records.length})</span>
        </h4>
        {elencoUl(records)}
      </div>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center flex-1">
          <input
            type="search"
            placeholder="Cerca per nome, cognome…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${inputCls} sm:max-w-xs`}
          />
          {isDip && (
            <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
              Ordina per
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {SORT_OPZIONI.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button
          onClick={apriNuovo}
          className="bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors whitespace-nowrap"
        >
          + Nuovo {config.singolare.toLowerCase()}
        </button>
      </div>

      <p className="text-sm text-gray-500">
        {listaFiltrata.length} {listaFiltrata.length === 1 ? config.singolare.toLowerCase() : config.label.toLowerCase()}
        {query && ` su ${lista.length}`}
      </p>

      {errore && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {errore}
        </div>
      )}

      {listaFiltrata.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-400">
          Nessun record.
        </div>
      ) : isDip ? (
        <div className="space-y-5">
          {sezioneElenco('In forza', inForza, 'bg-emerald-500')}
          {sezioneElenco('Cessati', cessati, 'bg-red-500')}
        </div>
      ) : (
        elencoUl(ordinati)
      )}
    </div>
  )
}

// ------------------------------------------------------------------
function CampoInput({
  field,
  value,
  onChange,
}: {
  field: RUField
  value: string
  onChange: (v: string) => void
}) {
  if (field.type === 'textarea') {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={inputCls}
      />
    )
  }
  if (field.type === 'choice') {
    const opts = field.choices ?? []
    const fuoriLista = value && !opts.includes(value)
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">—</option>
        {fuoriLista && <option value={value}>{value} (valore attuale)</option>}
        {opts.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    )
  }
  const htmlType =
    field.type === 'date'
      ? 'date'
      : field.type === 'number'
        ? 'number'
        : field.type === 'currency'
          ? 'number'
          : field.type === 'email'
            ? 'email'
            : field.type === 'tel'
              ? 'tel'
              : 'text'
  return (
    <input
      type={htmlType}
      step={field.type === 'currency' ? '0.01' : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  )
}
