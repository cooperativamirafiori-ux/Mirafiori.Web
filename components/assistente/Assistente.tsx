'use client'

/**
 * Bottone "?" fisso in basso a destra, su tutte le pagine dell'app, che apre la
 * chat con l'assistente. Montato una volta sola in app/(app)/layout.tsx, quindi
 * la conversazione resta aperta mentre si cambia pagina.
 *
 * La risposta arriva in un Markdown ridottissimo (grassetto, elenchi, link
 * interni): lo disegna `TestoRisposta` qui sotto, senza mai inserire HTML.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Msg {
  ruolo: 'utente' | 'assistente'
  testo: string
  id?: number | null
  utile?: boolean | null
  errore?: boolean
}

// Pagine con una barra di bottoni fissa in fondo (Avanti/Indietro, azioni di
// gruppo): lì il "?" si alza, altrimenti copre il bottone principale sul telefono.
// Aggiungendo una barra fissa in fondo a una pagina, aggiungerla qui.
const CON_BARRA_IN_FONDO = ['/richiesta-fattura', '/risorse-umane/timbrature/responsabili']

const ESEMPI = [
  'Come segno un giorno di malattia?',
  'Come chiedo una fattura per un cliente?',
  'Dove segnalo un guasto?',
]

export function Assistente() {
  const pathname = usePathname()
  const [aperto, setAperto] = useState(false)
  const alzato = CON_BARRA_IN_FONDO.some((p) => pathname === p || pathname?.startsWith(p + '/'))
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [testo, setTesto] = useState('')
  const [attesa, setAttesa] = useState(false)
  const fondo = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, attesa])

  useEffect(() => {
    if (aperto) campo.current?.focus()
  }, [aperto])

  useEffect(() => {
    if (!aperto) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAperto(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aperto])

  async function invia(domanda: string) {
    const d = domanda.trim()
    if (!d || attesa) return
    const storia = msgs.filter((m) => !m.errore).map(({ ruolo, testo }) => ({ ruolo, testo }))
    setMsgs((m) => [...m, { ruolo: 'utente', testo: d }])
    setTesto('')
    setAttesa(true)
    try {
      const r = await fetch('/api/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domanda: d, pagina: pathname, storia }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Qualcosa è andato storto. Riprova.')
      setMsgs((m) => [...m, { ruolo: 'assistente', testo: j.risposta, id: j.id ?? null, utile: null }])
    } catch (e) {
      setMsgs((m) => [
        ...m,
        { ruolo: 'assistente', testo: e instanceof Error ? e.message : 'Errore', errore: true },
      ])
    } finally {
      setAttesa(false)
    }
  }

  async function valuta(i: number, utile: boolean) {
    const m = msgs[i]
    if (!m?.id) return
    setMsgs((all) => all.map((x, k) => (k === i ? { ...x, utile } : x)))
    await fetch(`/api/assistente/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utile }),
    }).catch(() => {})
  }

  return (
    <>
      {!aperto && (
        <button
          onClick={() => setAperto(true)}
          aria-label="Aiuto: chiedi all'assistente"
          title="Hai bisogno di aiuto?"
          className={`fixed ${alzato ? 'bottom-28' : 'bottom-4'} right-4 z-40 w-14 h-14 rounded-full bg-brand-cyan text-white text-2xl font-bold shadow-lg hover:bg-brand-cyan-dark transition-colors print:hidden`}
        >
          ?
        </button>
      )}

      {aperto && (
        <div
          className="fixed inset-0 z-40 bg-black/30 sm:bg-transparent sm:pointer-events-none flex items-end sm:justify-end print:hidden"
          onClick={() => setAperto(false)}
        >
          <div
            role="dialog"
            aria-label="Assistente"
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto bg-white w-full sm:w-[400px] h-[85vh] sm:h-[600px] sm:max-h-[calc(100vh-2rem)] sm:m-4 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 flex flex-col"
          >
            {/* Testata */}
            <div className="flex items-center justify-between px-4 py-3 bg-brand-cyan text-white rounded-t-2xl">
              <div>
                <p className="font-bold">Assistente</p>
                <p className="text-xs text-white/80">Ti aiuto a usare l&apos;app</p>
              </div>
              <div className="flex items-center gap-3">
                {msgs.length > 0 && (
                  <button onClick={() => setMsgs([])} className="text-sm text-white/90 hover:text-white underline">
                    Ricomincia
                  </button>
                )}
                <button
                  onClick={() => setAperto(false)}
                  aria-label="Chiudi"
                  className="w-9 h-9 rounded-full hover:bg-white/20 text-xl leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Conversazione */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
              {msgs.length === 0 && (
                <div className="space-y-3">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] text-gray-800">
                    Ciao! Chiedimi come si fa qualcosa nell&apos;app, con parole tue. Ti dico dove andare
                    e cosa premere.
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    {ESEMPI.map((e) => (
                      <button
                        key={e}
                        onClick={() => invia(e)}
                        className="text-left text-sm px-3 py-2 rounded-xl border border-brand-cyan/50 text-brand-cyan-dark bg-white hover:bg-brand-cyan/10"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msgs.map((m, i) =>
                m.ruolo === 'utente' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] bg-brand-cyan text-white rounded-2xl rounded-tr-sm px-4 py-2 text-[15px] whitespace-pre-wrap">
                      {m.testo}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="max-w-[92%]">
                    <div
                      className={`rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] border ${
                        m.errore ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-white border-gray-200 text-gray-800'
                      }`}
                    >
                      <TestoRisposta testo={m.testo} onLink={() => window.innerWidth < 640 && setAperto(false)} />
                    </div>
                    {!m.errore && m.id && (
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 pl-1">
                        {m.utile === null || m.utile === undefined ? (
                          <>
                            <span>Ti è stata utile?</span>
                            <button onClick={() => valuta(i, true)} className="px-2 py-0.5 rounded-full border border-gray-300 hover:bg-gray-100">
                              Sì
                            </button>
                            <button onClick={() => valuta(i, false)} className="px-2 py-0.5 rounded-full border border-gray-300 hover:bg-gray-100">
                              No
                            </button>
                          </>
                        ) : (
                          <span>{m.utile ? 'Grazie!' : 'Grazie, lo segnalo per migliorare la guida.'}</span>
                        )}
                      </div>
                    )}
                  </div>
                ),
              )}

              {attesa && (
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] text-gray-500 w-fit">
                  Sto cercando la risposta…
                </div>
              )}
              <div ref={fondo} />
            </div>

            {/* Scrittura */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                invia(testo)
              }}
              className="border-t border-gray-200 p-3 bg-white sm:rounded-b-2xl"
            >
              <div className="flex gap-2 items-end">
                <textarea
                  ref={campo}
                  value={testo}
                  onChange={(e) => setTesto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      invia(testo)
                    }
                  }}
                  rows={2}
                  maxLength={1000}
                  placeholder="Scrivi la tua domanda…"
                  className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-cyan"
                />
                <button
                  type="submit"
                  disabled={attesa || !testo.trim()}
                  className="px-4 py-2.5 rounded-xl bg-primary text-white font-semibold disabled:opacity-40"
                >
                  Invia
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-400 leading-snug">
                Le domande si salvano senza il tuo nome, per migliorare l&apos;app. Non scrivere dati
                personali. L&apos;assistente può sbagliare: nel dubbio chiedi a un collega.
              </p>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Markdown minimo

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\(\/[^)\s]*\))/g

function Inline({ testo, onLink }: { testo: string; onLink: () => void }) {
  const pezzi = testo.split(INLINE)
  return (
    <>
      {pezzi.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>
        const l = p.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/)
        if (l)
          return (
            <Link key={i} href={l[2]} onClick={onLink} className="text-brand-cyan-dark font-semibold underline">
              {l[1]}
            </Link>
          )
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

function TestoRisposta({ testo, onLink }: { testo: string; onLink: () => void }) {
  const righe = testo.split('\n')
  const blocchi: React.ReactNode[] = []
  let i = 0
  while (i < righe.length) {
    const r = righe[i]
    if (/^\s*\d+[.)]\s+/.test(r)) {
      const voci: string[] = []
      while (i < righe.length && /^\s*\d+[.)]\s+/.test(righe[i])) voci.push(righe[i++].replace(/^\s*\d+[.)]\s+/, ''))
      blocchi.push(
        <ol key={blocchi.length} className="list-decimal pl-5 space-y-1">
          {voci.map((v, k) => <li key={k}><Inline testo={v} onLink={onLink} /></li>)}
        </ol>,
      )
    } else if (/^\s*[-*•]\s+/.test(r)) {
      const voci: string[] = []
      while (i < righe.length && /^\s*[-*•]\s+/.test(righe[i])) voci.push(righe[i++].replace(/^\s*[-*•]\s+/, ''))
      blocchi.push(
        <ul key={blocchi.length} className="list-disc pl-5 space-y-1">
          {voci.map((v, k) => <li key={k}><Inline testo={v} onLink={onLink} /></li>)}
        </ul>,
      )
    } else if (r.trim()) {
      blocchi.push(<p key={blocchi.length}><Inline testo={r.replace(/^#+\s*/, '')} onLink={onLink} /></p>)
      i++
    } else i++
  }
  return <div className="space-y-2 leading-relaxed">{blocchi}</div>
}
