'use client'

/**
 * Chat dell'assistente delle manutenzioni, nel Pannello di controllo (solo admin).
 *
 * L'assistente legge le richieste e PROPONE le operazioni: ognuna compare come
 * scheda con «Conferma». Alla conferma è il browser a chiamare le stesse API
 * del Pannello, con la sessione dell'admin: stessi controlli, stesse mail,
 * stesso Log Attività. Poi la pagina si aggiorna (router.refresh).
 *
 * Le risposte arrivano in un Markdown ridotto (grassetto ed elenchi), disegnato
 * da `Testo` qui sotto senza mai inserire HTML.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AzioneProposta, MessaggioAssistenteManutenzioni } from '@/types/manutenzioni'

type StatoAzione = 'da-confermare' | 'in-corso' | 'fatta' | 'errore' | 'annullata'

interface AzioneUI extends AzioneProposta {
  stato: StatoAzione
  errore?: string
}

interface Msg {
  ruolo: 'utente' | 'assistente'
  testo: string
  azioni?: AzioneUI[]
  errore?: boolean
}

const ESEMPI = [
  'Elenco delle richieste attive assegnate a Mirco Marrano, con cosa fare, sede e indirizzo',
  'Quali richieste aperte non hanno ancora un tecnico?',
  'Cosa c\'è di urgente questa settimana?',
]

const ESITO: Record<StatoAzione, string> = {
  'da-confermare': '[In attesa di conferma]',
  'in-corso': '[In attesa di conferma]',
  fatta: '[Eseguito]',
  errore: '[Non eseguito]',
  annullata: '[Annullato dall\'admin]',
}

/** La storia per il server: le schede diventano righe di testo con il loro esito. */
function storiaPerServer(msgs: Msg[]): MessaggioAssistenteManutenzioni[] {
  return msgs
    .filter((m) => !m.errore)
    .map((m) => ({
      ruolo: m.ruolo,
      testo: m.azioni?.length
        ? `${m.testo}\n\n${m.azioni
            .map((a) => `${ESITO[a.stato]} ${a.titolo} — ${a.richiesta}: ${a.descrizione.replace(/\n/g, ' · ')}${a.errore ? ` (errore: ${a.errore})` : ''}`)
            .join('\n')}`
        : m.testo,
    }))
}

export function AssistenteManutenzioni() {
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [testo, setTesto] = useState('')
  const [attesa, setAttesa] = useState(false)
  const fondo = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, attesa])

  useEffect(() => {
    if (!aperto) return
    campo.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAperto(false)
    window.addEventListener('keydown', esc)
    const scorrimento = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', esc)
      document.body.style.overflow = scorrimento
    }
  }, [aperto])

  async function invia(domanda: string) {
    const d = domanda.trim()
    if (!d || attesa) return
    const storia = storiaPerServer(msgs)
    setMsgs((m) => [...m, { ruolo: 'utente', testo: d }])
    setTesto('')
    setAttesa(true)
    try {
      const r = await fetch('/api/manutenzioni/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domanda: d, storia }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Qualcosa è andato storto. Riprova.')
      const azioni: AzioneUI[] = (j.azioni ?? []).map((a: AzioneProposta) => ({ ...a, stato: 'da-confermare' }))
      setMsgs((m) => [...m, { ruolo: 'assistente', testo: j.testo ?? '', azioni }])
    } catch (e) {
      setMsgs((m) => [...m, { ruolo: 'assistente', testo: e instanceof Error ? e.message : 'Errore', errore: true }])
    } finally {
      setAttesa(false)
    }
  }

  function aggiorna(id: string, cambio: Partial<AzioneUI>) {
    setMsgs((all) =>
      all.map((m) => (m.azioni?.some((a) => a.id === id) ? { ...m, azioni: m.azioni.map((a) => (a.id === id ? { ...a, ...cambio } : a)) } : m)),
    )
  }

  async function esegui(a: AzioneUI): Promise<boolean> {
    aggiorna(a.id, { stato: 'in-corso', errore: undefined })
    try {
      const r = await fetch(a.url, {
        method: a.metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a.corpo),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `Errore ${r.status}`)
      aggiorna(a.id, { stato: 'fatta' })
      return true
    } catch (e) {
      aggiorna(a.id, { stato: 'errore', errore: e instanceof Error ? e.message : 'Errore' })
      return false
    }
  }

  async function confermaUna(a: AzioneUI) {
    if (await esegui(a)) router.refresh()
  }

  async function confermaTutte(azioni: AzioneUI[]) {
    let qualcuna = false
    // Una alla volta: due operazioni sulla stessa richiesta non devono incrociarsi.
    for (const a of azioni.filter((x) => x.stato === 'da-confermare' || x.stato === 'errore')) {
      if (await esegui(a)) qualcuna = true
    }
    if (qualcuna) router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setAperto(true)}
        className="w-full flex items-center gap-3 rounded-2xl border border-brand-cyan/40 bg-white px-4 py-3 text-left shadow-sm hover:bg-brand-cyan/5"
      >
        <span className="w-10 h-10 shrink-0 rounded-xl bg-brand-cyan text-white flex items-center justify-center text-lg">✦</span>
        <span>
          <span className="block font-semibold text-gray-800">Chiedi all&apos;assistente</span>
          <span className="block text-xs text-gray-500">Elenchi per tecnico o struttura, assegnazioni, messaggi, chiusure: scrivi cosa ti serve.</span>
        </span>
      </button>

      {aperto && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-stretch sm:justify-end print:hidden" onClick={() => setAperto(false)}>
          <div
            role="dialog"
            aria-label="Assistente manutenzioni"
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:w-[480px] h-[92vh] sm:h-full rounded-t-2xl sm:rounded-none shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-brand-cyan text-white rounded-t-2xl sm:rounded-none">
              <div>
                <p className="font-bold">Assistente manutenzioni</p>
                <p className="hidden sm:block text-xs text-white/80">Legge le richieste e prepara le operazioni da confermare</p>
              </div>
              <div className="flex items-center gap-3">
                {msgs.length > 0 && (
                  <button onClick={() => setMsgs([])} className="text-sm text-white/90 hover:text-white underline">
                    Ricomincia
                  </button>
                )}
                <button onClick={() => setAperto(false)} aria-label="Chiudi" className="w-9 h-9 rounded-full hover:bg-white/20 text-xl leading-none">
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
              {msgs.length === 0 && (
                <div className="space-y-3">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] text-gray-800">
                    Chiedimi le richieste che ti servono, o cosa fare su una richiesta. Le operazioni le preparo io,
                    ma partono solo quando premi «Conferma».
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    {ESEMPI.map((e) => (
                      <button key={e} onClick={() => invia(e)}
                        className="text-left text-sm px-3 py-2 rounded-xl border border-brand-cyan/50 text-brand-cyan-dark bg-white hover:bg-brand-cyan/10">
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msgs.map((m, i) =>
                m.ruolo === 'utente' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] bg-brand-cyan text-white rounded-2xl rounded-tr-sm px-4 py-2 text-[15px] whitespace-pre-wrap">{m.testo}</div>
                  </div>
                ) : (
                  <div key={i} className="max-w-[95%] space-y-2">
                    {m.testo && (
                      <div className={`rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] border ${m.errore ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-white border-gray-200 text-gray-800'}`}>
                        <Testo testo={m.testo} />
                      </div>
                    )}
                    {m.azioni && m.azioni.length > 0 && (
                      <div className="space-y-2">
                        {m.azioni.map((a) => (
                          <SchedaAzione key={a.id} a={a} onConferma={() => confermaUna(a)} onAnnulla={() => aggiorna(a.id, { stato: 'annullata' })} />
                        ))}
                        {m.azioni.filter((a) => a.stato === 'da-confermare').length > 1 && (
                          <button onClick={() => confermaTutte(m.azioni!)}
                            className="w-full px-4 py-2.5 rounded-xl bg-primary text-white font-semibold">
                            Conferma tutte ({m.azioni.filter((a) => a.stato === 'da-confermare').length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ),
              )}

              {attesa && (
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] text-gray-500 w-fit">
                  Sto guardando le richieste…
                </div>
              )}
              <div ref={fondo} />
            </div>

            <form onSubmit={(e) => { e.preventDefault(); invia(testo) }} className="border-t border-gray-200 p-3 bg-white">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={campo}
                  value={testo}
                  onChange={(e) => setTesto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(testo) }
                  }}
                  rows={2}
                  maxLength={2000}
                  placeholder="Scrivi cosa ti serve…"
                  className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-cyan"
                />
                <button type="submit" disabled={attesa || !testo.trim()} className="px-4 py-2.5 rounded-xl bg-primary text-white font-semibold disabled:opacity-40">
                  Invia
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-400 leading-snug">
                L&apos;assistente può sbagliare: controlla ogni operazione prima di confermarla.
              </p>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function SchedaAzione({ a, onConferma, onAnnulla }: { a: AzioneUI; onConferma: () => void; onAnnulla: () => void }) {
  const bordo =
    a.stato === 'fatta' ? 'border-emerald-300 bg-emerald-50'
      : a.stato === 'errore' ? 'border-red-300 bg-red-50'
        : a.stato === 'annullata' ? 'border-gray-200 bg-gray-100 opacity-70'
          : 'border-amber-300 bg-white'
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${bordo}`}>
      <p className="font-semibold text-gray-800">{a.titolo}</p>
      <p className="text-xs text-gray-500">{a.richiesta}</p>
      <p className="mt-1 text-gray-800 whitespace-pre-wrap">{a.descrizione}</p>
      {a.avviso && <p className="mt-1 text-xs text-gray-500">{a.avviso}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {a.stato === 'da-confermare' || a.stato === 'errore' ? (
          <>
            <button onClick={onConferma} className="px-3 py-1.5 rounded-lg bg-primary text-white font-semibold">
              {a.stato === 'errore' ? 'Riprova' : 'Conferma'}
            </button>
            <button onClick={onAnnulla} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 bg-white">
              Annulla
            </button>
          </>
        ) : a.stato === 'in-corso' ? (
          <span className="text-gray-500">In corso…</span>
        ) : a.stato === 'fatta' ? (
          <span className="text-emerald-700 font-semibold">✓ Fatto</span>
        ) : (
          <span className="text-gray-500">Annullata</span>
        )}
        {a.stato === 'errore' && a.errore && <span className="text-red-700 text-xs w-full">{a.errore}</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Markdown minimo

function Inline({ testo }: { testo: string }) {
  return (
    <>
      {testo.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
        p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
      )}
    </>
  )
}

function Testo({ testo }: { testo: string }) {
  const righe = testo.split('\n')
  const blocchi: React.ReactNode[] = []
  let i = 0
  while (i < righe.length) {
    const r = righe[i]
    if (/^\s*\d+[.)]\s+/.test(r)) {
      const voci: string[] = []
      while (i < righe.length && /^\s*\d+[.)]\s+/.test(righe[i])) voci.push(righe[i++].replace(/^\s*\d+[.)]\s+/, ''))
      blocchi.push(<ol key={blocchi.length} className="list-decimal pl-5 space-y-1">{voci.map((v, k) => <li key={k}><Inline testo={v} /></li>)}</ol>)
    } else if (/^\s*[-*•]\s+/.test(r)) {
      const voci: { testo: string; dentro: boolean }[] = []
      while (i < righe.length && /^\s*[-*•]\s+/.test(righe[i])) {
        voci.push({ testo: righe[i].replace(/^\s*[-*•]\s+/, ''), dentro: /^\s{2,}/.test(righe[i]) })
        i++
      }
      blocchi.push(
        <ul key={blocchi.length} className="list-disc pl-5 space-y-1">
          {voci.map((v, k) => <li key={k} className={v.dentro ? 'ml-4 list-[circle]' : ''}><Inline testo={v.testo} /></li>)}
        </ul>,
      )
    } else if (r.trim()) {
      blocchi.push(<p key={blocchi.length}><Inline testo={r.replace(/^#+\s*/, '')} /></p>)
      i++
    } else i++
  }
  return <div className="space-y-2 leading-relaxed">{blocchi}</div>
}
