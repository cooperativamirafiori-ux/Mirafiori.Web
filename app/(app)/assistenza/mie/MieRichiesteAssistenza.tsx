'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Banner } from '@/components/ui/Banner'
import { Modale } from '@/components/ui/Modale'
import {
  GIORNI_RIAPERTURA,
  PRIORITA_STILE,
  STATI_APERTI,
  STATO_STILE,
  dataBreve,
  dispositivoDi,
  riapribile,
  type RichiestaAssistenza,
} from '@/types/assistenza'

/**
 * Le richieste di chi è loggato.
 *
 * L'unica azione qui è la **riapertura**: se il problema torna, il ticket
 * riparte da dove era con tutto il suo storico, invece di nascere una seconda
 * volta senza memoria della prima. È il sostituto della conferma via mail di
 * Acquisti: chi legge questa pagina è già dentro l'app, un link tokenizzato non
 * aggiungerebbe niente.
 */
export function MieRichiesteAssistenza({ iniziali }: { iniziali: RichiestaAssistenza[] }) {
  const router = useRouter()
  const [soloAperte, setSoloAperte] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [daRiaprire, setDaRiaprire] = useState<RichiestaAssistenza | null>(null)
  const [perche, setPerche] = useState('')

  const visibili = useMemo(
    () => (soloAperte ? iniziali.filter((t) => STATI_APERTI.includes(t.stato)) : iniziali),
    [iniziali, soloAperte],
  )

  async function azione(t: RichiestaAssistenza, body: Record<string, unknown>) {
    setBusy(t.spItemId)
    setErrore(null)
    try {
      const res = await fetch(`/api/assistenza/${t.spItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Operazione non riuscita')
      setDaRiaprire(null)
      setPerche('')
      router.refresh()
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={() => setSoloAperte(true)}
          className={`px-3 py-1.5 rounded-full border ${
            soloAperte
              ? 'bg-brand-cyan text-white border-brand-cyan'
              : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          In corso
        </button>
        <button
          onClick={() => setSoloAperte(false)}
          className={`px-3 py-1.5 rounded-full border ${
            !soloAperte
              ? 'bg-brand-cyan text-white border-brand-cyan'
              : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          Tutte
        </button>
      </div>

      <Banner tono="errore">{errore}</Banner>

      {visibili.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Nessuna richiesta.{' '}
          <Link href="/assistenza/nuova" className="text-brand-cyan underline">
            Chiedi assistenza
          </Link>
        </div>
      ) : (
        visibili.map((t) => {
          const stile = STATO_STILE[t.stato] ?? STATO_STILE['Inviata']
          const dispositivo = dispositivoDi(t)
          const annullabile = t.stato === 'Inviata'

          return (
            <div
              key={t.spItemId}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-sm font-semibold text-gray-700">{t.codice}</span>
                  <span className="text-xs text-gray-400 ml-2">{dataBreve(t.dataApertura)}</span>
                </div>
                <span
                  className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${stile.badge}`}
                >
                  {t.stato}
                </span>
              </div>

              <p className="text-sm text-gray-800 font-medium">{t.problema}</p>

              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>{t.categoria}</span>
                {dispositivo && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span>{dispositivo}</span>
                  </>
                )}
                {t.priorita && (
                  <span className={`px-2 py-0.5 rounded-full ${PRIORITA_STILE[t.priorita] ?? ''}`}>
                    {t.priorita}
                  </span>
                )}
                {t.assegnatoNome && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span>se ne occupa {t.assegnatoNome}</span>
                  </>
                )}
                {t.riaperture > 0 && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span>riaperta {t.riaperture} volt{t.riaperture === 1 ? 'a' : 'e'}</span>
                  </>
                )}
              </div>

              {t.stato === 'Attesa utente' && (
                <p className="text-xs text-orange-700 bg-orange-50 border-l-2 border-orange-300 px-3 py-2 rounded">
                  L’IT ti ha chiesto una informazione: guarda la mail e rispondi, il ticket è fermo
                  qui.
                </p>
              )}

              {t.stato === 'Risolta' && t.interventi && (
                <p className="text-xs text-gray-600 bg-emerald-50/70 border-l-2 border-emerald-300 px-3 py-2 rounded">
                  <strong>Cosa è stato fatto:</strong> {t.interventi}
                </p>
              )}

              {t.stato === 'Annullata' && t.motivoAnnullamento && (
                <p className="text-xs text-gray-600 bg-gray-50 border-l-2 border-gray-300 px-3 py-2 rounded">
                  <strong>Annullata:</strong> {t.motivoAnnullamento}
                </p>
              )}

              {t.allegatoNome && (
                <a
                  href={t.allegatoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-xs text-brand-cyan underline"
                >
                  📎 {t.allegatoNome}
                </a>
              )}

              <div className="flex items-center gap-4 pt-1 text-xs">
                {riapribile(t) && (
                  <button
                    onClick={() => setDaRiaprire(t)}
                    className="text-orange-600 font-semibold hover:underline"
                  >
                    ↩ Il problema si è ripresentato
                  </button>
                )}
                {annullabile && (
                  <button
                    disabled={busy === t.spItemId}
                    onClick={() => {
                      if (confirm(`Annullare la richiesta ${t.codice}?`)) {
                        azione(t, {
                          azione: 'annulla',
                          motivo: 'Annullata dal richiedente: risolto per conto suo.',
                        })
                      }
                    }}
                    className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                  >
                    Non serve più
                  </button>
                )}
              </div>
            </div>
          )
        })
      )}

      {daRiaprire && (
        <Modale
          titolo={`Riapri ${daRiaprire.codice}`}
          sottotitolo="Torna in carico all’IT con tutto lo storico di prima"
          onChiudi={() => setDaRiaprire(null)}
          azioni={
            <div className="flex gap-3">
              <button
                onClick={() => setDaRiaprire(null)}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50"
              >
                Lascia chiusa
              </button>
              <button
                disabled={busy === daRiaprire.spItemId}
                onClick={() => azione(daRiaprire, { azione: 'riapri', perche })}
                className="flex-1 bg-orange-500 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                Riapri il ticket
              </button>
            </div>
          }
        >
          <p className="text-sm text-gray-600 mb-3">
            Entro {GIORNI_RIAPERTURA} giorni dalla chiusura il ticket si riapre così; dopo, conviene
            aprirne uno nuovo. Scrivi cosa succede adesso: se è lo stesso identico problema o è
            cambiato qualcosa.
          </p>
          <textarea
            value={perche}
            onChange={(e) => setPerche(e.target.value)}
            rows={4}
            placeholder="Es. l’errore è tornato stamattina, uguale a prima."
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-cyan"
          />
        </Modale>
      )}
    </div>
  )
}
