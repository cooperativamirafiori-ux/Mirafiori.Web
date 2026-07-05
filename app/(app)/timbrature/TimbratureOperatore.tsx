'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Servizio, Timbratura, RiepilogoPeriodo } from '@/types/timbrature'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

function pad(n: number) { return String(n).padStart(2, '0') }
function ymd(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}` }
function ultimoGiorno(y: number, m: number) { return new Date(y, m, 0).getDate() }
function weekdayShort(dataYmd: string) {
  const [y, m, d] = dataYmd.split('-').map(Number)
  return GIORNI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}
const oreFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))

interface FormRiga {
  id?: string
  data: string
  servizioId: number | ''
  oraInizio: string
  oraFine: string
  mutua: boolean
  note: string
}

export default function TimbratureOperatore({ nome }: { nome: string }) {
  const now = new Date()
  const [anno, setAnno] = useState(now.getFullYear())
  const [mese, setMese] = useState(now.getMonth() + 1)
  const [servizi, setServizi] = useState<Servizio[]>([])
  const [timbrature, setTimbrature] = useState<Timbratura[]>([])
  const [riepilogo, setRiepilogo] = useState<RiepilogoPeriodo | null>(null)
  const [finestra, setFinestra] = useState<{ aperta: boolean; motivo?: string } | null>(null)
  const [scadenza, setScadenza] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')
  const [form, setForm] = useState<FormRiga | null>(null)
  const [salvando, setSalvando] = useState(false)

  const from = ymd(anno, mese, 1)
  const to = ymd(anno, mese, ultimoGiorno(anno, mese))

  const carica = useCallback(async () => {
    setLoading(true)
    setErrore('')
    try {
      const [rT, rR] = await Promise.all([
        fetch(`/api/timbrature?from=${from}&to=${to}`),
        fetch(`/api/timbrature/riepilogo?anno=${anno}&mese=${mese}`),
      ])
      const dT = await rT.json()
      const dR = await rR.json()
      if (!rT.ok) throw new Error(dT.error || 'Errore')
      if (!rR.ok) throw new Error(dR.error || 'Errore')
      setTimbrature(dT.timbrature ?? [])
      setRiepilogo(dR.riepilogo ?? null)
      setFinestra(dR.finestra ?? null)
      setScadenza(dR.scadenza)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di caricamento')
    } finally {
      setLoading(false)
    }
  }, [from, to, anno, mese])

  useEffect(() => {
    fetch('/api/timbrature/servizi')
      .then((r) => r.json())
      .then((d) => setServizi(d.servizi ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => { carica() }, [carica])

  const bloccato = finestra ? !finestra.aperta : false

  const timbPerGiorno = useMemo(() => {
    const m = new Map<string, Timbratura[]>()
    for (const t of timbrature) {
      const a = m.get(t.data) ?? []
      a.push(t)
      m.set(t.data, a)
    }
    return m
  }, [timbrature])

  const servizioById = useMemo(() => {
    const m = new Map<number, Servizio>()
    servizi.forEach((s) => m.set(s.id, s))
    return m
  }, [servizi])

  function cambiaMese(delta: number) {
    let m = mese + delta
    let y = anno
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMese(m); setAnno(y)
  }

  function nuovaRiga(data: string) {
    setForm({ data, servizioId: '', oraInizio: '', oraFine: '', mutua: false, note: '' })
  }
  function modificaRiga(t: Timbratura) {
    setForm({
      id: t.id, data: t.data, servizioId: t.servizioId,
      oraInizio: t.oraInizio ?? '', oraFine: t.oraFine ?? '', mutua: t.mutua, note: t.note ?? '',
    })
  }

  const servSelezionato = form && form.servizioId ? servizioById.get(Number(form.servizioId)) : undefined
  const isGiust = servSelezionato?.tipoVoce === 'giustificativo'

  async function salva() {
    if (!form) return
    if (!form.servizioId) { setErrore('Seleziona un servizio'); return }
    setSalvando(true); setErrore('')
    try {
      const payload = {
        data: form.data, servizioId: Number(form.servizioId),
        oraInizio: isGiust ? null : form.oraInizio, oraFine: isGiust ? null : form.oraFine,
        mutua: form.mutua, note: form.note,
      }
      const url = form.id ? `/api/timbrature/${form.id}` : '/api/timbrature'
      const method = form.id ? 'PATCH' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore salvataggio')
      setForm(null)
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSalvando(false)
    }
  }

  async function elimina(id: string) {
    if (!confirm('Eliminare questa riga?')) return
    setErrore('')
    try {
      const r = await fetch(`/api/timbrature/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    }
  }

  const giorni = riepilogo?.giorni ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Barra */}
      <div className="bg-primary text-white px-5 py-4">
        <Link href="/home" className="text-white/70 text-sm hover:text-white">← Home</Link>
        <h1 className="text-lg font-bold">Timbrature</h1>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5">
        {/* Selettore mese */}
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-4">
          <button onClick={() => cambiaMese(-1)} className="text-2xl text-gray-400 hover:text-gray-700 px-2">‹</button>
          <div className="text-center">
            <div className="font-bold text-gray-800">{MESI[mese - 1]} {anno}</div>
            {scadenza && (
              <div className="text-xs text-gray-500">Correzioni entro il {scadenza.split('-').reverse().join('/')}</div>
            )}
          </div>
          <button onClick={() => cambiaMese(1)} className="text-2xl text-gray-400 hover:text-gray-700 px-2">›</button>
        </div>

        {/* Cruscotto mese */}
        {riepilogo && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Kpi label="Ore lavorate" value={oreFmt(riepilogo.oreLavorate)} tone="cyan" />
            <Kpi label="Ore attese" value={oreFmt(riepilogo.oreAttese)} tone="slate" />
            <Kpi
              label="Scostamento"
              value={(riepilogo.scostamento >= 0 ? '+' : '') + oreFmt(riepilogo.scostamento)}
              tone={riepilogo.scostamento < 0 ? 'red' : 'green'}
            />
          </div>
        )}

        {/* Stato finestra */}
        {bloccato && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            🔒 {finestra?.motivo || 'Mese non modificabile'}. Le righe sono in sola lettura.
          </div>
        )}
        {errore && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{errore}</div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-10">Caricamento…</div>
        ) : (
          <div className="space-y-2">
            {giorni.map((g) => {
              const righe = timbPerGiorno.get(g.data) ?? []
              const oreGiorno = righe.reduce((s, t) => s + t.ore, 0)
              const incompleto = !g.festivo && oreGiorno + 1e-9 < g.oreAttese
              return (
                <div key={g.data} className={`bg-white rounded-xl border ${incompleto ? 'border-amber-200' : 'border-gray-100'} shadow-sm`}>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="text-center w-10">
                        <div className="text-xs text-gray-400">{weekdayShort(g.data)}</div>
                        <div className="font-bold text-gray-700">{Number(g.data.slice(8, 10))}</div>
                      </div>
                      {g.festivo ? (
                        <span className="text-xs font-semibold text-rose-500">{g.festivitaNome}</span>
                      ) : (
                        <span className="text-xs text-gray-500">
                          {oreFmt(oreGiorno)} / {oreFmt(g.oreAttese)} h
                          {incompleto && <span className="ml-1 text-amber-600 font-semibold">·  incompleto</span>}
                        </span>
                      )}
                    </div>
                    {!bloccato && (
                      <button onClick={() => nuovaRiga(g.data)} className="text-sm font-semibold text-brand-cyan-dark hover:underline">+ riga</button>
                    )}
                  </div>
                  {righe.length > 0 && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {righe.map((t) => (
                        <div key={t.id} className="flex items-center justify-between px-4 py-2 text-sm">
                          <div>
                            <span className={`font-medium ${t.tipoVoce === 'giustificativo' ? 'text-accent-purple' : 'text-gray-800'}`}>
                              {t.servizioNome}{t.mutua ? ' (Mutua)' : ''}
                            </span>
                            <span className="text-gray-400 ml-2">
                              {t.oraInizio && t.oraFine ? `${t.oraInizio}–${t.oraFine}` : ''} · {oreFmt(t.ore)} h
                            </span>
                            {t.note && <div className="text-xs text-gray-400">{t.note}</div>}
                          </div>
                          {!bloccato && (
                            <div className="flex gap-3 text-xs">
                              <button onClick={() => modificaRiga(t)} className="text-gray-500 hover:text-gray-800">Modifica</button>
                              <button onClick={() => elimina(t.id)} className="text-red-500 hover:text-red-700">Elimina</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Form riga */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={() => setForm(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-3">{form.id ? 'Modifica riga' : 'Nuova riga'} · {form.data.split('-').reverse().join('/')}</h3>
            <label className="block text-sm text-gray-600 mb-1">Servizio</label>
            <select
              value={form.servizioId}
              onChange={(e) => setForm({ ...form, servizioId: e.target.value ? Number(e.target.value) : '' })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3"
            >
              <option value="">— seleziona —</option>
              <optgroup label="Servizi">
                {servizi.filter((s) => s.tipoVoce === 'lavoro').map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </optgroup>
              <optgroup label="Giustificativi">
                {servizi.filter((s) => s.tipoVoce === 'giustificativo').map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </optgroup>
            </select>

            {!isGiust && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Dalle</label>
                  <input type="time" value={form.oraInizio} onChange={(e) => setForm({ ...form, oraInizio: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Alle</label>
                  <input type="time" value={form.oraFine} onChange={(e) => setForm({ ...form, oraFine: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                </div>
              </div>
            )}
            {isGiust && (
              <p className="text-xs text-gray-500 mb-3">Il giustificativo occupa il monte ore atteso della giornata.</p>
            )}

            {!isGiust && (
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
                <input type="checkbox" checked={form.mutua} onChange={(e) => setForm({ ...form, mutua: e.target.checked })} />
                Malattia (Mutua)
              </label>
            )}

            <label className="block text-sm text-gray-600 mb-1">Note</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4" />

            <div className="flex gap-3">
              <button onClick={() => setForm(null)} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-semibold">Annulla</button>
              <button onClick={salva} disabled={salvando} className="flex-1 py-2.5 rounded-lg bg-brand-cyan text-white font-semibold disabled:opacity-50">
                {salvando ? 'Salvo…' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'cyan' | 'slate' | 'red' | 'green' }) {
  const tones: Record<string, string> = {
    cyan: 'text-brand-cyan-dark',
    slate: 'text-slate-600',
    red: 'text-red-600',
    green: 'text-emerald-600',
  }
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-3 py-3 text-center">
      <div className={`text-xl font-bold ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
