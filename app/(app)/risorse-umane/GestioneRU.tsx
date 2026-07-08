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

/** Etichetta stato rapporto con pallino colorato e dicitura sempre visibile. */
function StatoBadge({ stato }: { stato: string }) {
  const stile = STATO_RAPPORTO_STILE[stato] ?? {
    badge: 'bg-gray-100 text-gray-700 border-gray-200',
    dot: 'bg-gray-400',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${stile.badge}`}
    >
      <span className={`h-2 w-2 rounded-full ${stile.dot}`} />
      {stato}
    </span>
  )
}

/** Badge Full/Part Time. */
function RegimeBadge({ regime }: { regime: 'Full Time' | 'Part Time' }) {
  const cls =
    regime === 'Full Time'
      ? 'bg-sky-100 text-sky-800 border-sky-200'
      : 'bg-indigo-100 text-indigo-800 border-indigo-200'
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${cls}`}>
      {regime}
    </span>
  )
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
  const [dettaglio, setDettaglio] = useState<RURecord | null>(null)
  const [formAperto, setFormAperto] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>(() => formInizialeDa(null, fields))
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const inListFields = useMemo(() => fields.filter((f) => f.inList && f.key !== 'Cognome' && f.key !== 'Nome'), [fields])

  const listaFiltrata = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = [...lista].sort((a, b) => nomeCompleto(a).localeCompare(nomeCompleto(b)))
    if (!q) return base
    return base.filter((r) => {
      const hay = [nomeCompleto(r), ...inListFields.map((f) => String(r[f.key] ?? ''))]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [lista, query, inListFields])

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
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {dettaglio.StatoRapporto && <StatoBadge stato={String(dettaglio.StatoRapporto)} />}
              {regimeOrario(dettaglio) && <RegimeBadge regime={regimeOrario(dettaglio)!} />}
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
  const isDip = entity === 'dipendenti'

  function riga(r: RURecord) {
    const regime = isDip ? regimeOrario(r) : null
    const stato = isDip && r.StatoRapporto ? String(r.StatoRapporto) : null
    return (
      <li key={r.spItemId}>
        <button
          onClick={() => setDettaglio(r)}
          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="font-semibold text-gray-800 truncate">{nomeCompleto(r)}</div>
            {inListFields.length > 0 && (
              <div className="text-xs text-gray-500 truncate">
                {inListFields
                  .map((f) => formatValore(f, r[f.key]))
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {regime && <RegimeBadge regime={regime} />}
            {stato && <StatoBadge stato={stato} />}
            <span className="text-gray-300">›</span>
          </div>
        </button>
      </li>
    )
  }

  const elencoUl = (records: RURecord[]) => (
    <ul className="divide-y divide-gray-100 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {records.map(riga)}
    </ul>
  )

  const inForza = isDip ? listaFiltrata.filter((r) => String(r.StatoRapporto ?? '') !== 'Cessato') : []
  const cessati = isDip ? listaFiltrata.filter((r) => String(r.StatoRapporto ?? '') === 'Cessato') : []

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
        <input
          type="search"
          placeholder="Cerca per nome, cognome…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${inputCls} sm:max-w-xs`}
        />
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
        elencoUl(listaFiltrata)
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
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">—</option>
        {field.choices?.map((c) => (
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
