'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { StatoDipendenteMese, Timbratura, RiepilogoPeriodo, ProfiloOrario, ChiusuraMese } from '@/types/timbrature'

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const GG = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const oreFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))
const segno = (n: number) => (n >= 0 ? '+' : '') + oreFmt(n)
function fmtRange(from: string, to: string) {
  const f = `${from.slice(8, 10)}/${from.slice(5, 7)}`
  const t = `${to.slice(8, 10)}/${to.slice(5, 7)}`
  return f === t ? f : `${f}–${t}`
}
function scostClasse(n: number) {
  if (n < -0.001) return 'bg-red-100 text-red-700'
  if (n > 0.001) return 'bg-emerald-100 text-emerald-700'
  return 'bg-gray-100 text-gray-600'
}

interface Dettaglio {
  dipendente: { id: number; cognomeNome: string; email: string }
  timbrature: Timbratura[]
  riepilogo: RiepilogoPeriodo
  profili: ProfiloOrario[]
  chiusura: ChiusuraMese | null
}

export default function CruscottoTimbrature() {
  const now = new Date()
  const [anno, setAnno] = useState(now.getFullYear())
  const [mese, setMese] = useState(now.getMonth() + 1)
  const [righe, setRighe] = useState<StatoDipendenteMese[]>([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')
  const [visionati, setVisionati] = useState<Set<number>>(new Set())
  const [dettaglio, setDettaglio] = useState<Dettaglio | null>(null)
  const [azione, setAzione] = useState(false)
  const [profiloForm, setProfiloForm] = useState<Record<number, string>>({})

  // Giorni festivi del mese (per segnalare il lavoro in festività nel dettaglio)
  const festivoByData = useMemo(() => {
    const m = new Map<string, string>()
    dettaglio?.riepilogo.giorni.forEach((g) => {
      if (g.festivo) m.set(g.data, g.festivitaNome ?? 'Festività')
    })
    return m
  }, [dettaglio])

  const carica = useCallback(async () => {
    setLoading(true); setErrore('')
    try {
      const r = await fetch(`/api/timbrature/hr/stato?anno=${anno}&mese=${mese}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      setRighe(d.dipendenti ?? [])
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(false)
    }
  }, [anno, mese])

  useEffect(() => { carica() }, [carica])

  function cambiaMese(delta: number) {
    let m = mese + delta, y = anno
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMese(m); setAnno(y); setVisionati(new Set())
  }

  async function apriDettaglio(dipendenteId: number) {
    setErrore('')
    try {
      const r = await fetch(`/api/timbrature/hr/dipendente/${dipendenteId}?anno=${anno}&mese=${mese}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      setDettaglio(d)
      setVisionati((s) => new Set(s).add(dipendenteId))
      const p: ProfiloOrario | undefined = d.profili?.[0]
      setProfiloForm({
        1: String(p?.oreLun ?? ''), 2: String(p?.oreMar ?? ''), 3: String(p?.oreMer ?? ''),
        4: String(p?.oreGio ?? ''), 5: String(p?.oreVen ?? ''), 6: String(p?.oreSab ?? ''), 7: String(p?.oreDom ?? ''),
      })
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    }
  }

  async function chiudi(dipendenteId: number) {
    if (!confirm('Chiudere il mese? Verrà generato il foglio ore nella cartella personale e il mese non sarà più modificabile dall\'operatore.')) return
    setAzione(true); setErrore('')
    try {
      const r = await fetch('/api/timbrature/hr/chiudi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipendenteId, anno, mese }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      setDettaglio(null)
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setAzione(false)
    }
  }

  async function riapri(dipendenteId: number) {
    if (!confirm('Riaprire il mese per consentire correzioni?')) return
    setAzione(true); setErrore('')
    try {
      const r = await fetch('/api/timbrature/hr/riapri', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipendenteId, anno, mese }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      setDettaglio(null)
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setAzione(false)
    }
  }

  async function salvaProfilo() {
    if (!dettaglio) return
    const decorrenza = `${anno}-${String(mese).padStart(2, '0')}-01`
    setAzione(true); setErrore('')
    try {
      const ore = Object.fromEntries(Object.entries(profiloForm).map(([k, v]) => [k, Number(v) || 0]))
      const r = await fetch('/api/timbrature/hr/profilo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dipendenteId: dettaglio.dipendente.id, decorrenza, ore }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Errore')
      await apriDettaglio(dettaglio.dipendente.id)
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore')
    } finally {
      setAzione(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-primary text-white px-5 py-4">
        <Link href="/risorse-umane" className="text-white/70 text-sm hover:text-white">← Risorse Umane</Link>
        <h1 className="text-lg font-bold">Cruscotto Timbrature</h1>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 mb-4">
          <button onClick={() => cambiaMese(-1)} className="text-2xl text-gray-400 hover:text-gray-700 px-2">‹</button>
          <div className="font-bold text-gray-800">{MESI[mese - 1]} {anno}</div>
          <button onClick={() => cambiaMese(1)} className="text-2xl text-gray-400 hover:text-gray-700 px-2">›</button>
        </div>

        {errore && <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{errore}</div>}

        {loading ? (
          <div className="text-center text-gray-400 py-10">Caricamento…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Dipendente</th>
                  <th className="text-right px-3 py-2 font-semibold">Lavorate</th>
                  <th className="text-right px-3 py-2 font-semibold">Attese</th>
                  <th className="text-right px-3 py-2 font-semibold">Scost.</th>
                  <th className="text-left px-3 py-2 font-semibold">Settimane</th>
                  <th className="text-center px-3 py-2 font-semibold">Incompl.</th>
                  <th className="text-center px-3 py-2 font-semibold">Stato</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {righe.map((s) => {
                  const chiuso = s.stato === 'chiuso'
                  const visto = visionati.has(s.dipendenteId)
                  return (
                    <tr key={s.dipendenteId} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-800">{s.cognomeNome}</div>
                        <div className="text-xs text-gray-400">{s.email}</div>
                      </td>
                      <td className="text-right px-3">{oreFmt(s.oreLavorate)}</td>
                      <td className="text-right px-3 text-gray-500">{oreFmt(s.oreAttese)}</td>
                      <td className={`text-right px-3 font-semibold ${s.scostamento < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {(s.scostamento >= 0 ? '+' : '') + oreFmt(s.scostamento)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {s.settimane.map((w) => (
                            <span
                              key={w.inizio}
                              title={`Sett. ${fmtRange(w.inizio, w.fine)} · ${oreFmt(w.oreLavorate)}/${oreFmt(w.oreAttese)} h${w.conclusa ? '' : ' (in corso)'}`}
                              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${w.conclusa ? scostClasse(w.scostamento) : 'bg-gray-50 text-gray-400 italic'}`}
                            >
                              {w.conclusa ? segno(w.scostamento) : '·'}
                            </span>
                          ))}
                          {s.settimane.length === 0 && <span className="text-gray-300">—</span>}
                        </div>
                      </td>
                      <td className="text-center px-3">
                        {s.giorniIncompleti > 0 ? <span className="text-amber-600 font-semibold">{s.giorniIncompleti}</span> : '—'}
                      </td>
                      <td className="text-center px-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${chiuso ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {chiuso ? 'Chiuso' : 'Aperto'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => apriDettaglio(s.dipendenteId)} className="text-brand-cyan-dark font-semibold hover:underline mr-3">
                          Controlla
                        </button>
                        {s.fileUrl && (
                          <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:underline mr-3">Foglio</a>
                        )}
                        {chiuso ? (
                          <button onClick={() => riapri(s.dipendenteId)} disabled={azione} className="text-amber-600 font-semibold hover:underline">Riapri</button>
                        ) : (
                          <button
                            onClick={() => chiudi(s.dipendenteId)}
                            disabled={azione || !visto}
                            title={!visto ? 'Apri “Controlla” prima di chiudere' : ''}
                            className="text-white bg-primary disabled:bg-gray-300 rounded-lg px-3 py-1.5 font-semibold"
                          >
                            Chiudi
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {righe.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-gray-400 py-8">Nessun dipendente. Verifica il seed dell'anagrafica.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer dettaglio */}
      {dettaglio && (
        <div className="fixed inset-0 bg-black/40 flex justify-end z-50" onClick={() => setDettaglio(null)}>
          <div className="bg-white w-full sm:max-w-lg h-full overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-gray-800">{dettaglio.dipendente.cognomeNome}</h3>
              <button onClick={() => setDettaglio(null)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <p className="text-xs text-gray-400 mb-4">{MESI[mese - 1]} {anno} · {dettaglio.dipendente.email}</p>

            <div className="grid grid-cols-3 gap-2 mb-5">
              <Mini label="Lavorate" value={oreFmt(dettaglio.riepilogo.oreLavorate)} />
              <Mini label="Attese" value={oreFmt(dettaglio.riepilogo.oreAttese)} />
              <Mini label="Scost." value={(dettaglio.riepilogo.scostamento >= 0 ? '+' : '') + oreFmt(dettaglio.riepilogo.scostamento)} rosso={dettaglio.riepilogo.scostamento < 0} />
            </div>

            {/* Scostamento per settimana */}
            {dettaglio.riepilogo.settimane.length > 0 && (
              <div className="border border-gray-200 rounded-xl p-3 mb-5">
                <div className="font-semibold text-gray-700 text-sm mb-2">Scostamento per settimana</div>
                <div className="space-y-1.5">
                  {dettaglio.riepilogo.settimane.map((w) => (
                    <div key={w.inizio} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Sett. {fmtRange(w.inizio, w.fine)}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-gray-400">{oreFmt(w.oreLavorate)}/{oreFmt(w.oreAttese)} h</span>
                        {w.conclusa ? (
                          <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${scostClasse(w.scostamento)}`}>
                            {segno(w.scostamento)} h
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">in corso</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monte ore (HR) */}
            <div className="border border-gray-200 rounded-xl p-3 mb-5">
              <div className="font-semibold text-gray-700 text-sm mb-2">Monte ore settimanale (decorrenza {String(mese).padStart(2, '0')}/{anno})</div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {GG.map((g, i) => (
                  <div key={g} className="text-center">
                    <div className="text-[10px] text-gray-400">{g}</div>
                    <input
                      value={profiloForm[i + 1] ?? ''}
                      onChange={(e) => setProfiloForm({ ...profiloForm, [i + 1]: e.target.value })}
                      className="w-full border border-gray-300 rounded px-1 py-1 text-center text-sm"
                      inputMode="decimal"
                    />
                  </div>
                ))}
              </div>
              <button onClick={salvaProfilo} disabled={azione} className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50">
                Salva monte ore
              </button>
            </div>

            {/* Righe del mese */}
            <div className="font-semibold text-gray-700 text-sm mb-2">Righe del mese ({dettaglio.timbrature.length})</div>
            <div className="space-y-1 mb-5">
              {dettaglio.timbrature.map((t) => (
                <div key={t.id} className="flex justify-between text-sm border-b border-gray-50 py-1">
                  <span>
                    {t.data.slice(8, 10)}/{t.data.slice(5, 7)} · {t.servizioNome}{t.mutua ? ' (Mutua)' : ''}
                    {t.tipoVoce === 'lavoro' && festivoByData.has(t.data) && (
                      <span
                        title={festivoByData.get(t.data)}
                        className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
                      >
                        lavoro in festività
                      </span>
                    )}
                  </span>
                  <span className="text-gray-400">{t.oraInizio && t.oraFine ? `${t.oraInizio}–${t.oraFine} · ` : ''}{oreFmt(t.ore)} h</span>
                </div>
              ))}
              {dettaglio.timbrature.length === 0 && <div className="text-sm text-gray-400">Nessuna riga inserita.</div>}
            </div>

            <div className="flex gap-3">
              {dettaglio.chiusura?.stato === 'chiuso' ? (
                <button onClick={() => riapri(dettaglio.dipendente.id)} disabled={azione} className="flex-1 py-2.5 rounded-lg border border-amber-400 text-amber-700 font-semibold">Riapri mese</button>
              ) : (
                <button onClick={() => chiudi(dettaglio.dipendente.id)} disabled={azione} className="flex-1 py-2.5 rounded-lg bg-primary text-white font-semibold disabled:opacity-50">
                  Chiudi mese e genera foglio
                </button>
              )}
            </div>
            {dettaglio.chiusura?.fileUrl && (
              <a href={dettaglio.chiusura.fileUrl} target="_blank" rel="noopener noreferrer" className="block text-center mt-3 text-sm text-brand-cyan-dark font-semibold">
                📄 Apri foglio ore generato
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Mini({ label, value, rosso }: { label: string; value: string; rosso?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg py-2 text-center">
      <div className={`font-bold ${rosso ? 'text-red-600' : 'text-gray-800'}`}>{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  )
}
