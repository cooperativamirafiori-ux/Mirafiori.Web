'use client'

import { useMemo, useState } from 'react'
import {
  CATEGORIE_SOFTWARE,
  PERIODICITA_SOFTWARE,
  STATI_SOFTWARE,
  type Software,
} from '@/types/software'

interface Props {
  iniziali: Software[]
}

type FormState = {
  servizio: string
  categoria: string
  account: string
  password: string
  linkPortale: string
  referente: string
  costo: string
  periodicita: string
  rinnovoAutomatico: boolean
  scadenza: string
  cartaPagamento: string
  stato: string
  note: string
  calendarEmails: string
}

// Calendario interno proposto di default per i nuovi inserimenti
const CALENDARIO_DEFAULT = 'ufficio.rendicontazione@cooperativamirafiori.com'

const FORM_VUOTO: FormState = {
  servizio: '',
  categoria: '',
  account: '',
  password: '',
  linkPortale: '',
  referente: '',
  costo: '',
  periodicita: '',
  rinnovoAutomatico: false,
  scadenza: '',
  cartaPagamento: '',
  stato: 'Attivo',
  note: '',
  calendarEmails: CALENDARIO_DEFAULT,
}

function fromSoftware(s: Software): FormState {
  return {
    servizio: s.servizio,
    categoria: s.categoria,
    account: s.account,
    password: s.password,
    linkPortale: s.linkPortale,
    referente: s.referente,
    costo: s.costo != null ? String(s.costo) : '',
    periodicita: s.periodicita,
    rinnovoAutomatico: s.rinnovoAutomatico,
    scadenza: s.scadenza ?? '',
    cartaPagamento: s.cartaPagamento,
    stato: s.stato || 'Attivo',
    note: s.note,
    calendarEmails: s.calendarEmails,
  }
}

/** Giorni mancanti alla scadenza (negativo = scaduto). null se senza data. */
function giorniAllaScadenza(scadenza?: string): number | null {
  if (!scadenza) return null
  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  const d = new Date(`${scadenza}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return Math.round((d.getTime() - oggi.getTime()) / 86_400_000)
}

function scadenzaBadge(scadenza?: string): { testo: string; classe: string } | null {
  const g = giorniAllaScadenza(scadenza)
  if (g == null) return null
  const data = new Date(`${scadenza}T00:00:00`).toLocaleDateString('it-IT')
  if (g < 0) return { testo: `Scaduto il ${data}`, classe: 'bg-red-100 text-red-700' }
  if (g <= 20) return { testo: `Scade tra ${g} gg (${data})`, classe: 'bg-red-100 text-red-700' }
  if (g <= 60) return { testo: `Scade tra ${g} gg (${data})`, classe: 'bg-amber-100 text-amber-700' }
  return { testo: `Scade il ${data}`, classe: 'bg-gray-100 text-gray-600' }
}

const euro = (n?: number) =>
  n == null ? '' : `€ ${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function GestioneSoftware({ iniziali }: Props) {
  const [lista, setLista] = useState<Software[]>(iniziali)
  const [formAperto, setFormAperto] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(FORM_VUOTO)
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [mostraPwd, setMostraPwd] = useState<Record<string, boolean>>({})
  const [uploadId, setUploadId] = useState<string | null>(null)

  const listaOrdinata = useMemo(() => {
    return [...lista].sort((a, b) => {
      const ga = giorniAllaScadenza(a.scadenza)
      const gb = giorniAllaScadenza(b.scadenza)
      if (ga == null && gb == null) return a.servizio.localeCompare(b.servizio)
      if (ga == null) return 1
      if (gb == null) return -1
      return ga - gb
    })
  }, [lista])

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }))
  }

  function apriNuovo() {
    setEditId(null)
    setForm(FORM_VUOTO)
    setErrore(null)
    setFormAperto(true)
  }

  function apriModifica(s: Software) {
    setEditId(s.spItemId)
    setForm(fromSoftware(s))
    setErrore(null)
    setFormAperto(true)
  }

  function chiudiForm() {
    setFormAperto(false)
    setEditId(null)
    setForm(FORM_VUOTO)
  }

  async function salva() {
    if (busy) return
    if (!form.servizio.trim()) {
      setErrore('Il nome del servizio è obbligatorio.')
      return
    }
    setErrore(null)
    setBusy(true)
    try {
      const payload = { ...form, costo: form.costo === '' ? null : Number(form.costo) }
      const url = editId ? `/api/software/${editId}` : '/api/software'
      const res = await fetch(url, {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Errore salvataggio')
      const { software } = await res.json()
      setLista((prev) =>
        editId
          ? prev.map((s) => (s.spItemId === editId ? software : s))
          : [software, ...prev],
      )
      chiudiForm()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(false)
    }
  }

  async function elimina(s: Software) {
    if (busy) return
    if (!confirm(`Eliminare "${s.servizio}"? L'operazione non è reversibile.`)) return
    setBusy(true)
    setErrore(null)
    try {
      const res = await fetch(`/api/software/${s.spItemId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Errore eliminazione')
      setLista((prev) => prev.filter((x) => x.spItemId !== s.spItemId))
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setBusy(false)
    }
  }

  async function caricaFattura(s: Software, file: File) {
    setUploadId(s.spItemId)
    setErrore(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/software/${s.spItemId}/fattura`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Errore upload')
      const { software } = await res.json()
      setLista((prev) => prev.map((x) => (x.spItemId === s.spItemId ? software : x)))
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      setUploadId(null)
    }
  }

  const inputCls =
    'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400'
  const labelCls = 'block text-xs font-semibold text-gray-600 mb-1'

  return (
    <div className="space-y-6">
      {/* Azioni */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {lista.length} {lista.length === 1 ? 'servizio' : 'servizi'} registrati
        </span>
        {!formAperto && (
          <button
            onClick={apriNuovo}
            className="bg-slate-700 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors"
          >
            + Aggiungi software
          </button>
        )}
      </div>

      {errore && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {errore}
        </div>
      )}

      {/* Form crea/modifica */}
      {formAperto && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-gray-800">
            {editId ? 'Modifica software' : 'Nuovo software'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={labelCls}>Nome servizio *</label>
              <input
                className={inputCls}
                value={form.servizio}
                onChange={(e) => set('servizio', e.target.value)}
                placeholder="es. Adobe Creative Cloud"
              />
            </div>

            <div>
              <label className={labelCls}>Categoria</label>
              <select className={inputCls} value={form.categoria} onChange={(e) => set('categoria', e.target.value)}>
                <option value="">—</option>
                {CATEGORIE_SOFTWARE.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Stato</label>
              <select className={inputCls} value={form.stato} onChange={(e) => set('stato', e.target.value)}>
                {STATI_SOFTWARE.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Account / email</label>
              <input className={inputCls} value={form.account} onChange={(e) => set('account', e.target.value)} />
            </div>

            <div>
              <label className={labelCls}>Password</label>
              <input className={inputCls} value={form.password} onChange={(e) => set('password', e.target.value)} />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Link al portale</label>
              <input className={inputCls} value={form.linkPortale} onChange={(e) => set('linkPortale', e.target.value)} placeholder="https://..." />
            </div>

            <div>
              <label className={labelCls}>Chi lo usa</label>
              <input className={inputCls} value={form.referente} onChange={(e) => set('referente', e.target.value)} placeholder="es. Ufficio comunicazione" />
            </div>

            <div>
              <label className={labelCls}>Carta di pagamento</label>
              <input className={inputCls} value={form.cartaPagamento} onChange={(e) => set('cartaPagamento', e.target.value)} placeholder="es. Visa •1234 — L. Cordaro" />
            </div>

            <div>
              <label className={labelCls}>Costo (€)</label>
              <input className={inputCls} type="number" step="0.01" min="0" value={form.costo} onChange={(e) => set('costo', e.target.value)} />
            </div>

            <div>
              <label className={labelCls}>Periodicità</label>
              <select className={inputCls} value={form.periodicita} onChange={(e) => set('periodicita', e.target.value)}>
                <option value="">—</option>
                {PERIODICITA_SOFTWARE.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Scadenza</label>
              <input className={inputCls} type="date" value={form.scadenza} onChange={(e) => set('scadenza', e.target.value)} />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-slate-600 focus:ring-slate-400"
                  checked={form.rinnovoAutomatico}
                  onChange={(e) => set('rinnovoAutomatico', e.target.checked)}
                />
                Rinnovo automatico
              </label>
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Note</label>
              <textarea className={inputCls} rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Calendari Outlook (email, separate da virgola)</label>
              <input
                className={inputCls}
                value={form.calendarEmails}
                onChange={(e) => set('calendarEmails', e.target.value)}
                placeholder="ufficio.rendicontazione@cooperativamirafiori.com, ..."
              />
              <p className="text-xs text-gray-400 mt-1">
                Con una scadenza impostata, l&apos;evento viene scritto direttamente in questi
                calendari (senza invito), con promemoria 20 giorni prima.
              </p>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={chiudiForm}
              disabled={busy}
              className="text-sm font-semibold px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-60"
            >
              Annulla
            </button>
            <button
              onClick={salva}
              disabled={busy}
              className="bg-slate-700 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              {busy ? 'Salvataggio…' : editId ? 'Salva modifiche' : 'Salva'}
            </button>
          </div>
        </div>
      )}

      {/* Elenco */}
      {listaOrdinata.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-400">
          Nessun software registrato. Aggiungine uno qui sopra.
        </div>
      ) : (
        <div className="space-y-3">
          {listaOrdinata.map((s) => {
            const badge = scadenzaBadge(s.scadenza)
            const pwdVisibile = !!mostraPwd[s.spItemId]
            return (
              <div key={s.spItemId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-gray-800 break-words">{s.servizio}</h3>
                      {s.categoria && (
                        <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{s.categoria}</span>
                      )}
                      {s.stato && s.stato !== 'Attivo' && (
                        <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{s.stato}</span>
                      )}
                    </div>
                    {s.referente && <p className="text-sm text-gray-500 mt-0.5">In uso a: {s.referente}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => apriModifica(s)} className="text-xs font-semibold text-slate-600 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-50">
                      Modifica
                    </button>
                    <button onClick={() => elimina(s)} className="text-xs font-semibold text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50">
                      Elimina
                    </button>
                  </div>
                </div>

                {badge && (
                  <div className="mt-3">
                    <span className={`inline-block text-xs font-semibold rounded-full px-2.5 py-1 ${badge.classe}`}>
                      {badge.testo}
                    </span>
                  </div>
                )}

                {Object.keys(s.calendarEventi).length > 0 && (
                  <p className="mt-2 text-xs text-gray-400">
                    📅 In calendario: {Object.keys(s.calendarEventi).join(', ')}
                  </p>
                )}

                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  {s.account && (
                    <div className="flex gap-2">
                      <dt className="text-gray-400 w-24 shrink-0">Account</dt>
                      <dd className="text-gray-700 break-all">{s.account}</dd>
                    </div>
                  )}
                  {s.password && (
                    <div className="flex gap-2">
                      <dt className="text-gray-400 w-24 shrink-0">Password</dt>
                      <dd className="text-gray-700 break-all flex items-center gap-2">
                        <span className="font-mono">{pwdVisibile ? s.password : '••••••••'}</span>
                        <button
                          onClick={() => setMostraPwd((p) => ({ ...p, [s.spItemId]: !pwdVisibile }))}
                          className="text-xs text-slate-500 hover:text-slate-700 underline"
                        >
                          {pwdVisibile ? 'nascondi' : 'mostra'}
                        </button>
                        <button
                          onClick={() => navigator.clipboard?.writeText(s.password)}
                          className="text-xs text-slate-500 hover:text-slate-700 underline"
                        >
                          copia
                        </button>
                      </dd>
                    </div>
                  )}
                  {(s.costo != null || s.periodicita) && (
                    <div className="flex gap-2">
                      <dt className="text-gray-400 w-24 shrink-0">Costo</dt>
                      <dd className="text-gray-700">
                        {euro(s.costo)}{s.periodicita ? ` · ${s.periodicita}` : ''}
                        {s.rinnovoAutomatico ? ' · rinnovo auto' : ''}
                      </dd>
                    </div>
                  )}
                  {s.cartaPagamento && (
                    <div className="flex gap-2">
                      <dt className="text-gray-400 w-24 shrink-0">Carta</dt>
                      <dd className="text-gray-700">{s.cartaPagamento}</dd>
                    </div>
                  )}
                  {s.linkPortale && (
                    <div className="flex gap-2">
                      <dt className="text-gray-400 w-24 shrink-0">Portale</dt>
                      <dd className="text-gray-700 break-all">
                        <a href={s.linkPortale} target="_blank" rel="noreferrer" className="text-slate-600 underline hover:text-slate-800">
                          Apri ↗
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>

                {s.note && <p className="mt-3 text-sm text-gray-500 whitespace-pre-wrap">{s.note}</p>}

                {/* Fattura */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                  {s.fatturaUrl ? (
                    <a href={s.fatturaUrl} target="_blank" rel="noreferrer" className="text-sm text-slate-600 underline hover:text-slate-800">
                      📄 {s.fatturaNome || 'Fattura'}
                    </a>
                  ) : (
                    <span className="text-sm text-gray-400">Nessuna fattura</span>
                  )}
                  <label className="text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer underline">
                    {uploadId === s.spItemId ? 'Caricamento…' : s.fatturaUrl ? 'Sostituisci fattura' : 'Carica fattura'}
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploadId === s.spItemId}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) caricaFattura(s, f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
