'use client'

/**
 * Passo «Dove abita il cliente?» — indirizzo, comune, CAP, provincia, nazione.
 *
 * **Si scrive il comune, il resto arriva da sé.** L'elenco dei comuni italiani
 * (`public/comuni.json`, rigenerato da `scripts/aggiorna-comuni.mjs`) si scarica
 * una volta quando si apre questo passo. Scelto il comune, la provincia si
 * compila; il CAP anche, se il comune ne ha uno solo. Le città ne hanno decine:
 * lì il modulo non può scegliere, ma dice in che intervallo deve stare e avvisa
 * se quello scritto non è del comune. È un avviso, non un blocco: l'elenco può
 * essere vecchio di qualche mese.
 *
 * Nazione e nazionalità restano due campi (l'ufficio li vuole entrambi) ma qui
 * è una domanda sola: «è in Italia?». La nazionalità la ricava il modulo.
 */

import { useEffect, useMemo, useState } from 'react'
import { Campo } from '@/components/ui/Campo'
import { NAZIONI } from '@/types/clienti'
import { cercaComuni, descriviCap, trovaComune, type Comune } from '@/types/comuni'
import type { NuovaRichiestaFatturaInput } from '@/types/fatture'
import { BottoniScelta, Domanda } from './Bottoni'

type Set = <K extends keyof NuovaRichiestaFatturaInput>(k: K, v: NuovaRichiestaFatturaInput[K]) => void

/** L'elenco si scarica una volta per pagina, anche se si torna più volte su questo passo. */
let elencoComuni: Promise<Comune[]> | null = null
function caricaComuni(): Promise<Comune[]> {
  if (!elencoComuni) {
    elencoComuni = fetch('/comuni.json')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => {
        elencoComuni = null
        return []
      })
  }
  return elencoComuni
}

export function PassoIndirizzo({
  valori,
  errori,
  set,
  onNazione,
}: {
  valori: NuovaRichiestaFatturaInput
  errori: Record<string, string>
  set: Set
  onNazione: (codice: string) => void
}) {
  const italia = valori.nazione === 'IT'
  const [comuni, setComuni] = useState<Comune[]>([])
  const [cercando, setCercando] = useState(false)

  useEffect(() => {
    if (italia) caricaComuni().then(setComuni)
  }, [italia])

  const comune = useMemo(() => trovaComune(comuni, valori.citta), [comuni, valori.citta])
  // Ci sono comuni con lo stesso nome in province diverse (Samone TO e TN,
  // Calliano AT e TN…): lì non si indovina, si propongono tutti.
  const omonimi = useMemo(
    () => (comune ? comuni.filter((c) => c[0] === comune[0]) : []),
    [comuni, comune],
  )
  const proposte = useMemo(
    () =>
      !cercando
        ? []
        : comune
          ? omonimi.length > 1 && !omonimi.some((c) => c[1] === valori.provincia)
            ? omonimi
            : []
          : cercaComuni(comuni, valori.citta),
    [comuni, valori.citta, valori.provincia, cercando, comune, omonimi],
  )

  // Chi scrive il nome intero senza toccare la proposta ottiene lo stesso
  // risultato: provincia (e CAP, se è uno solo) si mettono da sé.
  useEffect(() => {
    if (!italia || !comune || omonimi.length !== 1) return
    if (valori.provincia !== comune[1]) set('provincia', comune[1])
    if (comune[2].length === 1 && valori.cap !== comune[2][0]) set('cap', comune[2][0])
  }, [comune, omonimi.length, italia])

  function scegliComune(c: Comune) {
    set('citta', c[0])
    set('provincia', c[1])
    if (c[2].length === 1) set('cap', c[2][0])
    else if (valori.cap && !c[2].includes(valori.cap)) set('cap', '')
    setCercando(false)
  }

  const capFuori =
    italia && comune && /^\d{5}$/.test(valori.cap) && !comune[2].includes(valori.cap) && !errori.cap
      ? `Questo CAP non è di ${comune[0]}: i suoi CAP vanno ${descriviCap(comune)}.`
      : undefined

  return (
    <div className="space-y-7">
      <Domanda titolo="Il cliente abita (o ha sede) in Italia?">
        <BottoniScelta
          colonne={2}
          opzioni={[
            { valore: 'si', etichetta: 'Sì' },
            { valore: 'no', etichetta: "No, all'estero" },
          ]}
          valore={italia ? 'si' : 'no'}
          onScegli={(v) => onNazione(v === 'si' ? 'IT' : '')}
          errore={errori.nazionalita}
        />
        {!italia && (
          <Campo
            grande
            etichetta="In quale paese?"
            tipo="choice"
            scelte={NAZIONI.filter((n) => n.valore !== 'IT')}
            valore={valori.nazione}
            onChange={onNazione}
            vuoto="— Tocca per scegliere —"
            errore={errori.nazione}
          />
        )}
      </Domanda>

      <Domanda titolo="L'indirizzo">
        <div className="space-y-5">
          <Campo
            grande
            etichetta="Via e numero"
            valore={valori.indirizzo}
            onChange={(v) => set('indirizzo', v)}
            errore={errori.indirizzo}
            segnaposto="Es. Via Roma 12"
          />

          <div className="space-y-2">
            <Campo
              grande
              etichetta={italia ? 'Comune' : 'Città'}
              valore={valori.citta}
              onChange={(v) => {
                set('citta', v)
                setCercando(true)
              }}
              errore={errori.citta}
              aiuto={italia ? 'Scrivi le prime lettere e tocca il comune giusto.' : undefined}
            />
            {proposte.length > 0 && (
              <ul className="space-y-2">
                {proposte.map((c) => (
                  <li key={`${c[0]}-${c[1]}`}>
                    <button
                      type="button"
                      onClick={() => scegliComune(c)}
                      className="min-h-[52px] w-full rounded-2xl border-2 border-gray-200 bg-white px-4 py-2 text-left text-base hover:border-gray-300"
                    >
                      <strong>{c[0]}</strong> <span className="text-gray-500">({c[1]})</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Campo
              grande
              etichetta={italia ? 'CAP' : 'CAP (se c’è)'}
              valore={valori.cap}
              onChange={(v) => set('cap', italia ? v.replace(/\D/g, '') : v)}
              errore={errori.cap || capFuori}
              aiuto={italia && comune && comune[2].length > 1 ? descriviCap(comune) : undefined}
              maxLength={italia ? 5 : 10}
              inputMode={italia ? 'numeric' : undefined}
            />
            {italia && (
              <Campo
                grande
                etichetta="Provincia"
                valore={valori.provincia}
                onChange={(v) => set('provincia', v)}
                errore={errori.provincia}
                maiuscolo
                maxLength={2}
                aiuto={comune ? 'Messa da sola dal comune.' : undefined}
              />
            )}
          </div>
        </div>
      </Domanda>
    </div>
  )
}
