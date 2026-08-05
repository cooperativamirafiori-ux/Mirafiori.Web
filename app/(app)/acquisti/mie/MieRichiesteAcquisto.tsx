'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ESITI_CONSEGNA,
  STATI_APERTI,
  STATO_STILE,
  URGENZA_STILE,
  dataBreve,
  euro,
  luogoCorrisponde,
  type EsitoConsegna,
  type RichiestaAcquisto,
} from '@/types/acquisti'

export function MieRichiesteAcquisto({
  iniziali,
  strutturaPresidiata,
  luogoRitiro,
  sonoReferente,
}: {
  iniziali: RichiestaAcquisto[]
  /** Struttura in cui la consegna la confermano i referenti dell'ufficio. */
  strutturaPresidiata: string
  luogoRitiro: string
  /** true se l'utente è uno dei referenti: allora i pulsanti restano. */
  sonoReferente: boolean
}) {
  const router = useRouter()
  const [soloAperte, setSoloAperte] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  const visibili = useMemo(
    () => (soloAperte ? iniziali.filter((a) => STATI_APERTI.includes(a.stato)) : iniziali),
    [iniziali, soloAperte],
  )

  async function azione(a: RichiestaAcquisto, body: Record<string, unknown>) {
    setBusy(a.spItemId)
    setErrore(null)
    try {
      const res = await fetch(`/api/acquisti/${a.spItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Operazione non riuscita')
      router.refresh()
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(null)
    }
  }

  /** Il riordino rapido: riparte da una richiesta già fatta. */
  const linkDuplica = (a: RichiestaAcquisto) =>
    `/acquisti/nuova?${new URLSearchParams({
      struttura: String(a.struttura.id),
      descrizione: a.descrizione,
      quantita: String(a.quantita),
      categoria: a.categoria,
      ...(a.link ? { link: a.link } : {}),
    })}`

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={() => setSoloAperte(true)}
          className={`px-3 py-1.5 rounded-full border ${soloAperte ? 'bg-brand-orange text-white border-brand-orange' : 'bg-white text-gray-600 border-gray-200'}`}
        >
          In corso
        </button>
        <button
          onClick={() => setSoloAperte(false)}
          className={`px-3 py-1.5 rounded-full border ${!soloAperte ? 'bg-brand-orange text-white border-brand-orange' : 'bg-white text-gray-600 border-gray-200'}`}
        >
          Tutte
        </button>
      </div>

      {errore && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{errore}</div>}

      {visibili.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Nessuna richiesta.{' '}
          <Link href="/acquisti/nuova" className="text-brand-orange underline">
            Inseriscine una
          </Link>
        </div>
      ) : (
        visibili.map((a) => {
          const stile = STATO_STILE[a.stato] ?? STATO_STILE['Inviata']
          const inAttesaEsito = a.stato === 'Ordinata'
          const annullabile = ['Inviata', 'Presa in carico', 'Approvata'].includes(a.stato)

          return (
            <div
              key={a.spItemId}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-sm font-semibold text-gray-700">{a.codice}</span>
                  <span className="text-xs text-gray-400 ml-2">{dataBreve(a.dataRichiesta)}</span>
                </div>
                <span
                  className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${stile.badge}`}
                >
                  {a.stato}
                </span>
              </div>

              <p className="text-sm text-gray-800 font-medium">
                {a.descrizione}
                {a.quantita > 1 && <span className="text-gray-400"> ×{a.quantita}</span>}
              </p>

              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>{a.struttura.value}</span>
                <span className="text-gray-300">·</span>
                <span>{a.categoria}</span>
                {a.urgenza !== 'Normale' && (
                  <span className={`px-2 py-0.5 rounded-full ${URGENZA_STILE[a.urgenza] ?? ''}`}>
                    {a.urgenza}
                  </span>
                )}
                {a.serveEntro && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span>serve entro {dataBreve(a.serveEntro)}</span>
                  </>
                )}
              </div>

              {a.stato === 'Non approvata' && a.motivoRifiuto && (
                <p className="text-xs text-gray-600 bg-gray-50 border-l-2 border-gray-300 px-3 py-2 rounded">
                  <strong>Motivo:</strong> {a.motivoRifiuto}
                </p>
              )}

              {['Ordinata', 'Consegnata', 'Problema'].includes(a.stato) && (
                <div className="text-xs text-gray-500 bg-violet-50/60 rounded-lg px-3 py-2 space-y-0.5">
                  {a.fornitore && (
                    <p>
                      Fornitore: <strong className="text-gray-700">{a.fornitore}</strong>
                    </p>
                  )}
                  {a.dataConsegnaPrevista && (
                    <p>
                      Consegna prevista: {dataBreve(a.dataConsegnaPrevista)}
                      {a.luogoConsegna ? ` presso ${a.luogoConsegna.value}` : ''}
                    </p>
                  )}
                  {a.totale != null && a.totale > 0 && <p>Totale: {euro(a.totale)}</p>}
                  {a.esitoConsegna && <p>Esito: {a.esitoConsegna}</p>}
                </div>
              )}

              {/* Consegna presidiata: la conferma non è sua, e dirglielo qui
                  evita che aspetti una mail che non gli arriverà. */}
              {inAttesaEsito &&
                luogoCorrisponde(a, strutturaPresidiata) &&
                !sonoReferente && (
                  <div className="pt-1">
                    <p className="text-xs text-gray-500">
                      La consegna viene confermata dai referenti di {luogoRitiro}. Appena lo fanno
                      ricevi una mail e puoi passare a ritirare.
                    </p>
                  </div>
                )}

              {inAttesaEsito && (!luogoCorrisponde(a, strutturaPresidiata) || sonoReferente) && (
                <div className="pt-1">
                  <p className="text-xs text-gray-500 mb-1.5">
                    È arrivato? Puoi confermare anche dalla mail che ti abbiamo mandato.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ESITI_CONSEGNA.map((e) => (
                      <button
                        key={e}
                        disabled={busy === a.spItemId}
                        onClick={() => azione(a, { azione: 'esito', esito: e as EsitoConsegna })}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 ${
                          e === 'Tutto ok' ? 'bg-emerald-600 text-white' : 'bg-orange-500 text-white'
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 pt-1 text-xs">
                <Link href={linkDuplica(a)} className="text-brand-orange font-semibold">
                  ⧉ Duplica
                </Link>
                {annullabile && (
                  <button
                    disabled={busy === a.spItemId}
                    onClick={() => {
                      if (confirm(`Annullare la richiesta ${a.codice}?`)) {
                        azione(a, { azione: 'annulla', motivo: 'Annullata dal richiedente' })
                      }
                    }}
                    className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                  >
                    Annulla richiesta
                  </button>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
