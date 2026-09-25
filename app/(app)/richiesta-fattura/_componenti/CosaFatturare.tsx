'use client'

/**
 * Passo «Cosa ha comprato il cliente?» — descrizione, importo e, solo dove
 * serve, IVA e tipo di documento.
 *
 * **Quello che compare dipende dal servizio.** Se il centro di costo ha un
 * regime configurato (`regimeDi` in types/fatture.ts) l'IVA non si chiede:
 * la domanda dice già cosa scrivere («quanto ha pagato, IVA compresa») e sotto
 * compare lo scorporo. Altrimenti si chiede, con «non lo so» fra le risposte
 * ammesse — meglio un caso segnalato che un'aliquota indovinata.
 *
 * Le descrizioni frequenti del servizio (`descrizioniRapide`) si toccano invece
 * di scriverle; la casella resta modificabile.
 */

import { useState } from 'react'
import { Campo } from '@/components/ui/Campo'
import {
  ALIQUOTE,
  FUORI_CAMPO,
  TIPI_DOCUMENTO,
  calcoloIva,
  descrizioniRapide,
  regimeDi,
  type NuovaRichiestaFatturaInput,
} from '@/types/fatture'
import { BottoniScelta, Domanda, Link, Scorciatoie } from './Bottoni'

export const euro = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)

type Set = <K extends keyof NuovaRichiestaFatturaInput>(k: K, v: NuovaRichiestaFatturaInput[K]) => void

export function CosaFatturare({
  valori,
  errori,
  set,
  onCambiaServizio,
  preimpostato = false,
}: {
  valori: NuovaRichiestaFatturaInput
  errori: Record<string, string>
  set: Set
  onCambiaServizio: () => void
  /** Il servizio viene dall'ultima richiesta, non l'ha scelto ora: va messo in vista. */
  preimpostato?: boolean
}) {
  const regime = regimeDi(valori.centroCosto)
  const iva = calcoloIva(valori)
  const rapide = descrizioniRapide(valori.centroCosto)
  const [correzione, setCorrezione] = useState(valori.tipoDocumento !== 'Fattura')

  const domandaImporto = regime.daChiedere
    ? 'Quanto costa?'
    : regime.lordo
      ? 'Quanto ha pagato il cliente?'
      : 'Quanto costa, senza IVA?'

  return (
    <div className="space-y-7">
      {preimpostato ? (
        // Il servizio proposto dall'ultima richiesta è comodo ma pericoloso: chi
        // stavolta fattura per un altro servizio rischia di non accorgersene.
        // Per questo arancione e con un bottone vero, non un link grigio.
        <div className="rounded-2xl border-2 border-orange-400 bg-orange-50 p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-700">
            Controlla il servizio
          </p>
          <p className="mt-1 text-xl font-bold text-orange-900">{valori.centroCosto}</p>
          <p className="mt-1 text-base text-orange-800">
            È quello della tua ultima richiesta. Se questa fattura è per un altro servizio, cambialo.
          </p>
          <button
            type="button"
            onClick={onCambiaServizio}
            className="mt-3 min-h-[44px] w-full rounded-xl bg-orange-500 px-4 text-base font-semibold text-white active:bg-orange-600 sm:w-auto"
          >
            Cambia servizio
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 rounded-2xl bg-gray-50 px-4 py-2 text-base text-gray-700">
          <span>
            Servizio: <strong>{valori.centroCosto}</strong>
          </span>
          <Link onClick={onCambiaServizio}>Cambia</Link>
        </div>
      )}

      <Domanda
        titolo="Cosa ha comprato il cliente?"
        spiegazione={rapide.length ? 'Tocca una voce, oppure scrivi tu.' : undefined}
      >
        <Scorciatoie voci={rapide} attiva={valori.descrizione} onScegli={(v) => set('descrizione', v)} />
        <Campo
          grande
          etichetta="Descrizione"
          tipo="textarea"
          righe={2}
          valore={valori.descrizione}
          onChange={(v) => set('descrizione', v)}
          errore={errori.descrizione}
          segnaposto="Es. Cena per 4 persone"
        />
      </Domanda>

      <Domanda
        titolo={domandaImporto}
        spiegazione={
          !regime.daChiedere && regime.lordo
            ? `Scrivi il totale, IVA compresa: l'IVA la calcoliamo noi.`
            : undefined
        }
      >
        <label className="block">
          <span className="sr-only">Importo in euro</span>
          <span className="flex items-center gap-2">
            <span className="text-2xl font-semibold text-gray-500" aria-hidden>
              €
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={valori.importo}
              onChange={(e) => set('importo', e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder="0,00"
              className={`w-full max-w-[12rem] rounded-xl border px-4 py-3 text-2xl font-semibold focus:outline-none focus:ring-2 ${
                errori.importo
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-gray-300 focus:ring-primary'
              }`}
            />
          </span>
          {errori.importo && (
            <span className="mt-1 block text-sm font-medium text-red-600">{errori.importo}</span>
          )}
        </label>
        {iva.scorporo && (
          <p className="text-base text-gray-500">
            {euro(iva.scorporo.imponibile)} + IVA {euro(iva.scorporo.iva)} ={' '}
            <strong className="text-gray-700">{euro(iva.scorporo.totale)}</strong>
          </p>
        )}
      </Domanda>

      {regime.daChiedere && (
        <>
          <Domanda titolo="Il prezzo che hai scritto comprende l'IVA?">
            <BottoniScelta
              colonne={2}
              opzioni={[
                { valore: 'Totale (IVA compresa)', etichetta: 'Sì', sotto: 'è il totale' },
                { valore: 'Imponibile (IVA esclusa)', etichetta: 'No', sotto: "l'IVA va aggiunta" },
              ]}
              valore={valori.naturaImporto}
              onScegli={(v) => set('naturaImporto', v as NuovaRichiestaFatturaInput['naturaImporto'])}
              errore={errori.naturaImporto}
            />
          </Domanda>

          <Domanda titolo="Quale IVA?" spiegazione="Se non lo sai, tocca «Non lo so»: la sceglie chi fa la fattura.">
            <BottoniScelta
              opzioni={ALIQUOTE}
              valore={valori.aliquota}
              onScegli={(v) => set('aliquota', v)}
              errore={errori.aliquota}
            />
            {valori.aliquota === FUORI_CAMPO && (
              <Campo
                grande
                etichetta="Articolo di legge (solo se lo sai)"
                valore={valori.articoloEsclusione}
                onChange={(v) => set('articoloEsclusione', v)}
                segnaposto="Es. art. 10 DPR 633/72"
              />
            )}
          </Domanda>

          {!correzione ? (
            <Link onClick={() => setCorrezione(true)}>Devi correggere una fattura già fatta?</Link>
          ) : (
            <Domanda
              titolo="Che documento serve?"
              spiegazione="La nota di credito toglie soldi a una fattura già fatta, la nota di debito li aggiunge."
            >
              <BottoniScelta
                opzioni={TIPI_DOCUMENTO.map((t) => ({ valore: t, etichetta: t }))}
                valore={valori.tipoDocumento}
                onScegli={(v) => set('tipoDocumento', v as NuovaRichiestaFatturaInput['tipoDocumento'])}
              />
              {valori.tipoDocumento !== 'Fattura' && (
                <Campo
                  grande
                  etichetta="Quale fattura va corretta? (solo se lo sai)"
                  valore={valori.riferimentoDocumento}
                  onChange={(v) => set('riferimentoDocumento', v)}
                  segnaposto="Es. 214 del 12/07/2026"
                />
              )}
            </Domanda>
          )}
        </>
      )}
    </div>
  )
}
