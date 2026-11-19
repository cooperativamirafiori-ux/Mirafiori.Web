'use client'

/**
 * Scheda «Amazon» di Flussi fatture (Dennis, 17/11/2026).
 *
 * Amazon fa una fattura per tanti prodotti e più fatture per una spesa: per le
 * spese con CARTA Qonto il costo lo dà già il movimento (sul centro di costo
 * del sottoconto), e l'abbinamento con le fatture si fa qui, a mano, quando
 * c'è tempo. Le fatture Amazon con carta nascono pagate: qui non si paga
 * niente, si mette solo ordine.
 *  - Spese Amazon con la carta: per ognuna le fatture Amazon aperte vicine
 *    (prima lo stesso centro di costo), se ne spuntano anche più d'una.
 *  - Fatture Amazon da sistemare: quelle senza movimento, da chiudere a mano.
 * Le fatture Amazon Business a bonifico (MP05) non passano di qui: sono
 * debiti veri e restano in Da pagare.
 *
 * Da telefono: tutto impilato, i tasti vanno a capo.
 */

import { useCallback, useEffect, useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Vuoto } from '@/components/ui/Vuoto'
import { MovimentoDaAbbinare, Sistemato, COLONNE_MOVIMENTI, dataIt, euro, type Movimento } from './AbbinaQonto'
import { BottoneEsporta } from './BottoneEsporta'
import type { Colonna } from '@/lib/core/esporta-xlsx'

interface FatturaAmazon {
  id: string
  fornitore: string
  numero: string | null
  dataFattura: string | null
  importo: number
  cc: string | null
  ccIndicato: string | null
}

const COLONNE_FATTURE: Colonna<FatturaAmazon>[] = [
  { titolo: 'Fornitore', valore: (f) => f.fornitore, larghezza: 30 },
  { titolo: 'N. fattura', valore: (f) => f.numero, larghezza: 18 },
  { titolo: 'Data fattura', valore: (f) => f.dataFattura, tipo: 'data' },
  { titolo: 'Importo', valore: (f) => f.importo, tipo: 'euro' },
  { titolo: 'Centro di costo', valore: (f) => f.cc },
  { titolo: 'CC indicato', valore: (f) => f.ccIndicato },
]

interface Dati {
  movimenti: Movimento[]
  recenti: Movimento[]
  fatture: FatturaAmazon[]
  chiuse: FatturaAmazon[]
}

export function AmazonQonto({ onCambiato }: { onCambiato: () => Promise<void> | void }) {
  const [dati, setDati] = useState<Dati | null>(null)
  const [caricando, setCaricando] = useState(true)
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')
  const [messaggio, setMessaggio] = useState('')

  const carica = useCallback(async () => {
    setCaricando(true)
    try {
      const res = await fetch('/api/pagamenti/qonto-movimenti?vista=amazon')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Errore di lettura')
      setDati(j)
      setErrore('')
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di lettura')
    } finally {
      setCaricando(false)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  async function invia(corpo: Record<string, unknown>, ok: (esito: any) => string) {
    setInCorso(true)
    setErrore('')
    setMessaggio('')
    try {
      const res = await fetch('/api/pagamenti/qonto-movimenti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Operazione non riuscita')
      setMessaggio(ok(j.esito))
      await Promise.all([carica(), onCambiato()])
      return true
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione non riuscita')
      return false
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <p className="text-sm text-gray-600">
          Spese Amazon pagate con la carta Qonto dal 1° novembre 2026. Il costo è già registrato sul
          centro di costo della carta: qui si abbinano le fatture quando c’è tempo, o si chiudono.
          Le fatture Amazon da pagare con bonifico restano in <b>Da pagare</b>.
        </p>
        {dati && (
          <div className="mt-2 flex justify-end">
            <BottoneEsporta
              nomeFile="flussi-fatture-amazon"
              fogli={() => [
                { nome: 'Spese con carta', colonne: COLONNE_MOVIMENTI, righe: dati.movimenti },
                { nome: 'Fatture da sistemare', colonne: COLONNE_FATTURE, righe: dati.fatture },
                { nome: 'Spese sistemate', colonne: COLONNE_MOVIMENTI, righe: dati.recenti },
                { nome: 'Fatture chiuse a mano', colonne: COLONNE_FATTURE, righe: dati.chiuse },
              ]}
            />
          </div>
        )}
      </div>

      <Banner tono="errore">{errore}</Banner>
      <Banner tono="ok">{messaggio}</Banner>

      {caricando && !dati && <p className="text-sm text-gray-500">Caricamento…</p>}

      {dati && (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Spese Amazon con la carta ({dati.movimenti.length})
            </h3>
            {dati.movimenti.length === 0 ? (
              <Vuoto>Nessuna spesa Amazon da abbinare.</Vuoto>
            ) : (
              <ul className="space-y-3">
                {dati.movimenti.map((m) => (
                  <MovimentoDaAbbinare
                    key={m.id}
                    m={m}
                    amazon
                    inCorso={inCorso}
                    onAbbina={(ids) =>
                      invia({ azione: 'abbina', movimentoId: m.id, scadenzaIds: ids }, (e) =>
                        `Abbinata: ${e?.scadenze ?? ids.length} ${ids.length === 1 ? 'fattura' : 'fatture'}${e?.nota ? ` · ${e.nota}` : ''}`,
                      )
                    }
                    onIgnora={(nota) =>
                      invia({ azione: 'ignora', movimentoId: m.id, nota: nota || 'Amazon: chiusa senza fattura', sempre: false }, () =>
                        'Spesa chiusa senza fattura (il costo resta registrato)',
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Fatture Amazon da sistemare ({dati.fatture.length})
            </h3>
            {dati.fatture.length === 0 ? (
              <Vuoto>Nessuna fattura Amazon in sospeso.</Vuoto>
            ) : (
              <ul className="space-y-2">
                {dati.fatture.map((f) => (
                  <RigaFattura
                    key={f.id}
                    f={f}
                    inCorso={inCorso}
                    testo="Chiudi"
                    onClick={() =>
                      invia({ azione: 'chiudi_amazon', scadenzaId: f.id }, () => `Fattura ${f.numero ?? ''} chiusa`.replace('  ', ' '))
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          {(dati.recenti.length > 0 || dati.chiuse.length > 0) && (
            <details className="rounded-xl border border-gray-100 bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-gray-700">
                Sistemate di recente ({dati.recenti.length + dati.chiuse.length})
              </summary>
              <ul className="mt-3 space-y-2">
                {dati.recenti.map((m) => (
                  <Sistemato
                    key={m.id}
                    m={m}
                    inCorso={inCorso}
                    onAnnulla={() =>
                      invia({ azione: 'annulla', movimentoId: m.id }, () => 'Annullato: la spesa è tornata da abbinare')
                    }
                  />
                ))}
                {dati.chiuse.map((f) => (
                  <RigaFattura
                    key={f.id}
                    f={f}
                    inCorso={inCorso}
                    testo="Riapri"
                    secondario
                    onClick={() => invia({ azione: 'riapri_amazon', scadenzaId: f.id }, () => 'Fattura riaperta')}
                  />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}

function RigaFattura({
  f,
  inCorso,
  testo,
  secondario = false,
  onClick,
}: {
  f: FatturaAmazon
  inCorso: boolean
  testo: string
  secondario?: boolean
  onClick: () => Promise<boolean>
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 break-words">{f.fornitore}</p>
        <p className="text-xs text-gray-500">
          {f.numero ? `Fattura ${f.numero}` : 'Fattura'} del {dataIt(f.dataFattura)}
          {f.cc ? ` · ${f.cc}` : ''}
          {secondario ? ' · chiusa a mano' : ''}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-700">{euro(f.importo)}</span>
        <button
          onClick={() => void onClick()}
          disabled={inCorso}
          className={
            secondario
              ? 'text-xs text-gray-500 underline underline-offset-2 disabled:opacity-50'
              : 'rounded-xl border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-600 disabled:opacity-50'
          }
        >
          {testo}
        </button>
      </div>
    </li>
  )
}
