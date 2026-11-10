'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RichiestaManutenzione, Tecnico } from '@/types/manutenzioni'
import { StatoBadge } from '@/components/ui/StatoBadge'
import { Pratica } from '@/components/manutenzioni/Pratica'
import { PresaInCarico } from './PresaInCarico'

interface Props {
  richiesta: RichiestaManutenzione
  tecnici: Tecnico[]
  /** Messaggi del richiedente non ancora letti dalla gestione. */
  nonLetti?: number
  /** Aperta all'arrivo, dal link della mail (?r=…). */
  apertaAllInizio?: boolean
}

function daysSince(dateStr?: string): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function PrioritaBadge({ p }: { p: string }) {
  if (p.startsWith('Urgente')) return <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">🚨 URGENTE</span>
  if (p.startsWith('Alta'))    return <span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">⬆ Alta</span>
  if (p.startsWith('Media'))   return <span className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full">➡ Media</span>
  // Le priorità del modulo sono Normale, Alta e Urgente: "Media" e "Bassa" restano solo
  // per eventuali richieste vecchie.
  if (p.startsWith('Bassa'))   return <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">⬇ Bassa</span>
  return <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">Normale</span>
}

export function RichiestaCard({ richiesta: r, tecnici, nonLetti = 0, apertaAllInizio = false }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(apertaAllInizio)
  const [daLeggere, setDaLeggere] = useState(nonLetti)
  const segnaLetti = useCallback(() => setDaLeggere(0), [])
  const scheda = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (apertaAllInizio) scheda.current?.scrollIntoView({ block: 'start' })
  }, [apertaAllInizio])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Form state
  const [tecnicoId, setTecnicoId] = useState(r.tecnico?.id?.toString() ?? '')
  const [noteAssegnazione, setNoteAssegnazione] = useState('')
  const [confermaChiusura, setConfermaChiusura] = useState(false)
  const [dataIntervento, setDataIntervento] = useState(
    r.dataIntervento ? r.dataIntervento.slice(0, 10) : ''
  )
  const [note, setNote] = useState(r.noteResponsabile ?? '')

  const isCompletata = r.stato === 'Completata'
  const giorni = daysSince(r.dataRichiesta)
  const borderColor = r.priorita.startsWith('Urgente')
    ? 'border-l-red-500'
    : r.stato === 'In lavorazione'
    ? 'border-l-orange-400'
    : 'border-l-primary'

  async function salva(payload: Record<string, unknown>) {
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/manutenzioni/${r.spItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore')
      setMsg({ type: 'ok', text: data.stato === 'Completata'
        ? `✅ Chiusa — Totale costi: €${(data.importoTotale ?? 0).toFixed(2)}`
        : data.stato === 'In lavorazione'
        ? '✅ Tecnico assegnato'
        : '✅ Salvato' })
      router.refresh()
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setLoading(false)
    }
  }

  function handleAssegnaTecnico() {
    if (!tecnicoId) return
    const t = tecnici.find((t) => t.id.toString() === tecnicoId)
    if (!t) return
    salva({
      tecnicoId: t.id,
      tecnicoNome: t.title,
      ...(noteAssegnazione.trim() ? { noteResponsabile: noteAssegnazione.trim() } : {}),
    })
  }

  // Dal 1/11/2026 chiudere chiude e basta: i costi stanno nella sezione Costi.
  function handleChiudi() {
    const payload: Record<string, unknown> = { chiudi: true }
    if (dataIntervento) payload.dataIntervento = new Date(dataIntervento).toISOString()
    if (note) payload.noteResponsabile = note
    setConfermaChiusura(false)
    salva(payload)
  }

  function handleSalvaNotes() {
    salva({ noteResponsabile: note })
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-50'

  return (
    <div ref={scheda} className={`bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 ${borderColor} overflow-hidden scroll-mt-4`}>
      {/* ── Header sempre visibile ── */}
      <button
        className="w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-primary-dark">{r.idRichiesta || `#${r.spItemId}`}</span>
            <span className="text-gray-300">·</span>
            <span className="font-semibold text-gray-700">📍 {r.struttura.value || '—'}</span>
            <StatoBadge stato={r.stato} />
            <PrioritaBadge p={r.priorita} />
            {r.lungoCorso && (
              <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                ⏳ Lungo corso{r.previsioneLungoCorso ? ` · ${r.previsioneLungoCorso}` : ''}
              </span>
            )}
            {r.allegatoUrl && <span className="text-xs text-gray-500" title="Con foto">📷</span>}
            {daLeggere > 0 && (
              <span className="text-xs font-semibold text-white bg-primary px-2 py-0.5 rounded-full">
                ✉ {daLeggere === 1 ? '1 messaggio nuovo' : `${daLeggere} messaggi nuovi`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {giorni !== null && (
              <span className={`text-xs ${giorni > 7 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                {giorni === 0 ? 'oggi' : `${giorni}g fa`}
              </span>
            )}
            <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
          </div>
        </div>

        {r.tipoIntervento && (
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500">{r.tipoIntervento}</span>
          </div>
        )}

        {r.descrizione && (
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">{r.descrizione}</p>
        )}

        <div className="mt-2 flex items-center justify-between flex-wrap gap-1">
          <span className="text-xs text-gray-400">
            👤 {r.richiedente.displayName || r.richiedente.email || '—'}
            {r.dataRichiesta && <> · {new Date(r.dataRichiesta).toLocaleDateString('it-IT')}</>}
          </span>
          {r.tecnico
            ? <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">🔨 {r.tecnico.value}</span>
            : <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">⚠ Tecnico da assegnare</span>
          }
        </div>
      </button>

      {/* ── Pannello espanso ── */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50">

          {msg && (
            <div className={`text-sm px-3 py-2 rounded-lg ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {msg.text}
            </div>
          )}

          {/* Descrizione completa */}
          {r.descrizione && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Descrizione completa</p>
              <p className="text-sm text-gray-700 bg-white rounded-lg p-3 border border-gray-200 whitespace-pre-line">{r.descrizione}</p>
            </div>
          )}

          {r.allegatoUrl && (
            <a
              href={r.allegatoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary underline"
            >
              📷 Foto allegata{r.allegatoNome ? ` · ${r.allegatoNome}` : ''}
            </a>
          )}

          {!isCompletata && <PresaInCarico richiesta={r} />}

          {/* Cose da fare + messaggi con il richiedente */}
          <Pratica spItemId={r.spItemId} come="gestione" completata={isCompletata} onLetti={segnaLetti} />

          {!isCompletata && (
            <>
              {/* Sezione 1: Assegna tecnico */}
              <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Assegna tecnico</p>
                <div className="flex gap-2">
                  <select
                    value={tecnicoId}
                    onChange={(e) => setTecnicoId(e.target.value)}
                    className={`flex-1 ${inputCls}`}
                    disabled={loading}
                  >
                    <option value="">— Nessuno —</option>
                    {tecnici.map((t) => (
                      <option key={String(t.id)} value={t.id}>
                        {t.title}{t.ditta ? ` (${t.ditta})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssegnaTecnico}
                    disabled={loading || !tecnicoId}
                    className="px-3 py-2 bg-primary text-white text-sm rounded-lg disabled:opacity-40 hover:bg-primary-dark"
                  >
                    Assegna
                  </button>
                </div>
                {tecnicoId && (
                  <p className="text-xs text-gray-400">
                    📞 {tecnici.find((t) => t.id.toString() === tecnicoId)?.telefono || '—'}
                  </p>
                )}
                <textarea
                  value={noteAssegnazione}
                  onChange={(e) => setNoteAssegnazione(e.target.value)}
                  className={`${inputCls} resize-none h-16`}
                  placeholder="Note per il richiedente (facoltativo) — verranno incluse nell'email di notifica"
                  disabled={loading}
                />
              </div>

              {/* Sezione 2: Chiudi ticket */}
              <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Chiudi richiesta</p>
                <p className="text-xs text-gray-500">I costi si scrivono nella sezione Costi, anche dopo la chiusura.</p>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Data intervento</label>
                  <input type="date" value={dataIntervento}
                    onChange={(e) => setDataIntervento(e.target.value)}
                    className={inputCls} disabled={loading} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Note responsabile</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)}
                    className={`${inputCls} resize-none h-16`} placeholder="Note interne..." disabled={loading} />
                </div>
                {confermaChiusura ? (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
                    <p className="text-sm text-amber-900">Chiudere la richiesta? Arriva una mail al richiedente e non si riapre.</p>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={handleChiudi} disabled={loading}
                        className="flex-1 bg-accent-yellow text-primary-dark font-semibold text-sm py-2 rounded-lg disabled:opacity-40">
                        {loading ? 'Salvataggio…' : 'Sì, chiudi'}
                      </button>
                      <button onClick={() => setConfermaChiusura(false)}
                        className="flex-1 border border-gray-300 text-gray-600 text-sm py-2 rounded-lg">
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={handleSalvaNotes} disabled={loading || !note}
                      className="flex-1 border border-gray-300 text-gray-600 text-sm py-2 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                      Salva note
                    </button>
                    <button onClick={() => setConfermaChiusura(true)} disabled={loading}
                      className="flex-1 bg-accent-yellow text-primary-dark font-semibold text-sm py-2 rounded-lg disabled:opacity-40 hover:opacity-90">
                      Chiudi richiesta
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Se completata: riepilogo */}
          {isCompletata && (
            <div className="bg-green-50 rounded-lg border border-green-200 p-3 text-sm text-green-800 space-y-1">
              <p className="font-semibold">✅ Ticket chiuso</p>
              {r.importoFattura && <p>Importo fattura: <strong>€{r.importoFattura.toFixed(2)}</strong></p>}
              {r.oreLavoro && <p>Ore lavoro: <strong>{r.oreLavoro}h</strong></p>}
              {r.dataIntervento && <p>Data intervento: <strong>{new Date(r.dataIntervento).toLocaleDateString('it-IT')}</strong></p>}
              {r.noteResponsabile && <p>Note: {r.noteResponsabile}</p>}
            </div>
          )}

          <div className="h-0.5 bg-accent-yellow rounded-full opacity-40" />
        </div>
      )}
    </div>
  )
}
