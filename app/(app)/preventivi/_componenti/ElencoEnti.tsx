'use client'

/**
 * Elenco degli enti dei preventivi: si cerca, si aggiunge, si corregge.
 *
 * Il nome è l'intestazione in fattura ed è anche ciò che lega l'ente alle sue
 * tariffe: correggendolo, il server aggiorna anche il tariffario. Gli enti
 * delle coppie di Torino (Comune, ASL 1, ASL 2) e "Privato" hanno una chiave:
 * il nome si può correggere, ma non si possono nascondere.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { inputCls } from '@/components/ui/Campo'
import { Pill } from '@/components/ui/Pill'
import { Vuoto } from '@/components/ui/Vuoto'
import type { Ente } from '@/types/preventivi'
import { ModaleNuovoEnte } from './Destinatari'

export function ElencoEnti({ tutti }: { tutti: boolean }) {
  const [enti, setEnti] = useState<Ente[] | null>(null)
  const [configurata, setConfigurata] = useState(true)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')
  const [cerca, setCerca] = useState('')
  const [nascosti, setNascosti] = useState(false)
  const [modifica, setModifica] = useState<Ente | 'nuovo' | null>(null)

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/preventivi/enti')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Errore di lettura')
      setEnti(j.enti)
      setConfigurata(j.configurata)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di lettura')
    }
  }, [])
  useEffect(() => {
    void carica()
  }, [carica])

  async function attivo(e: Ente, valore: boolean) {
    setErrore('')
    const res = await fetch(`/api/preventivi/enti/${e.spItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attivo: valore }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return setErrore(j.error ?? 'Non salvato')
    setMessaggio(valore ? `«${e.nome}» di nuovo fra le scelte.` : `«${e.nome}» non compare più fra le scelte.`)
    await carica()
  }

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    return (enti ?? []).filter((e) => (nascosti || e.attivo) && (!q || `${e.nome} ${e.servizi}`.toLowerCase().includes(q)))
  }, [enti, cerca, nascosti])

  if (!configurata)
    return <Banner tono="avviso">La lista degli enti non è ancora creata: va lanciato scripts/provision-preventivi.mjs.</Banner>

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Gli enti a cui si fanno i preventivi, con il nome che compare in fattura. Per Torino nel preventivo si sceglie la coppia
        Comune + ASL.
      </p>
      <button onClick={() => setModifica('nuovo')} className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-primary text-white font-semibold">
        + Nuovo ente
      </button>
      <Banner tono="ok">{messaggio}</Banner>
      <Banner tono="errore">{errore}</Banner>
      <input className={inputCls} value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca un ente o un servizio…" />
      {tutti && (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={nascosti} onChange={(e) => setNascosti(e.target.checked)} />
          Mostra anche quelli nascosti
        </label>
      )}
      {!enti && !errore && <p className="text-sm text-gray-500">Carico…</p>}
      {enti && !visibili.length && <Vuoto>Nessun ente.</Vuoto>}
      <ul className="space-y-2">
        {visibili.map((e) => (
          <li key={e.spItemId} className={`bg-white rounded-xl border border-gray-100 p-3 ${e.attivo ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-gray-800">{e.nome}</span>
              {e.chiave && <Pill text={e.chiave === 'privato' ? 'privati' : 'coppia di Torino'} tono="azzurro" />}
              {!e.attivo && <Pill text="nascosto" tono="neutro" />}
            </div>
            {e.servizi && <p className="text-sm text-gray-600 mt-0.5">{e.servizi}</p>}
            {e.note && <p className="text-xs text-gray-500 mt-0.5">{e.note}</p>}
            <div className="flex flex-wrap gap-2 mt-2">
              <button onClick={() => setModifica(e)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold">
                Modifica
              </button>
              {tutti && !e.chiave && (
                <button
                  onClick={() => attivo(e, !e.attivo)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold"
                >
                  {e.attivo ? 'Nascondi' : 'Rimetti fra le scelte'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {modifica && (
        <ModaleNuovoEnte
          ente={modifica === 'nuovo' ? undefined : modifica}
          onChiudi={() => setModifica(null)}
          onFatto={async (e) => {
            setModifica(null)
            setMessaggio(`«${e.nome}» salvato.`)
            await carica()
          }}
        />
      )}
    </div>
  )
}
