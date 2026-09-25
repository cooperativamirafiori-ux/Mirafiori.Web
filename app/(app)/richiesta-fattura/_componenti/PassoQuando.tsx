'use client'

/**
 * Passo «Quando?» — il giorno del servizio e se il cliente ha già pagato.
 *
 * Il giorno si sceglie con tre bottoni (Oggi, Ieri, Un altro giorno): il
 * calendario compare solo col terzo, perché è il caso raro e il calendario del
 * telefono è la parte più difficile da usare di tutto il modulo.
 *
 * I tempi (5 giorni per mandare la richiesta, 10 per la fattura) si contano da
 * soli con `puntualita()`: l'avviso non blocca l'invio.
 *
 * La data dell'incasso segue il giorno del servizio finché chi compila non la
 * cambia: di solito si paga lo stesso giorno.
 */

import { useState } from 'react'
import { Campo } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import {
  GIORNI_EMISSIONE,
  MEZZI_PAGAMENTO,
  MEZZO_ALTRO,
  oggi,
  puntualita,
  type NuovaRichiestaFatturaInput,
} from '@/types/fatture'
import { BottoniScelta, Domanda, Link } from './Bottoni'

type Set = <K extends keyof NuovaRichiestaFatturaInput>(k: K, v: NuovaRichiestaFatturaInput[K]) => void

function ieri(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function PassoQuando({
  valori,
  errori,
  set,
  pagatoRisposto,
  onRispostaPagato,
}: {
  valori: NuovaRichiestaFatturaInput
  errori: Record<string, string>
  set: Set
  /** Sì/No sul pagamento è una domanda vera: finché non si risponde, non c'è un «no» sottinteso. */
  pagatoRisposto: boolean
  onRispostaPagato: (pagato: boolean) => void
}) {
  const [oggiS, ieriS] = [oggi(), ieri()]
  const giornoScelto =
    valori.dataPrestazione === oggiS ? 'oggi' : valori.dataPrestazione === ieriS ? 'ieri' : 'altro'
  const [altroGiorno, setAltroGiorno] = useState(giornoScelto === 'altro')
  const [incassoDiverso, setIncassoDiverso] = useState(
    Boolean(valori.dataIncasso) && valori.dataIncasso !== valori.dataPrestazione,
  )
  const tempi = puntualita(valori.dataPrestazione)

  function cambiaGiorno(data: string) {
    set('dataPrestazione', data)
    if (!incassoDiverso) set('dataIncasso', data)
  }

  return (
    <div className="space-y-7">
      <Domanda titolo="Quando c'è stato il servizio?">
        <BottoniScelta
          colonne={2}
          opzioni={[
            { valore: 'oggi', etichetta: 'Oggi' },
            { valore: 'ieri', etichetta: 'Ieri' },
            { valore: 'altro', etichetta: 'Un altro giorno' },
          ]}
          valore={altroGiorno ? 'altro' : giornoScelto}
          onScegli={(v) => {
            if (v === 'altro') return setAltroGiorno(true)
            setAltroGiorno(false)
            cambiaGiorno(v === 'oggi' ? oggiS : ieriS)
          }}
        />
        {altroGiorno && (
          <Campo
            grande
            etichetta="Che giorno?"
            tipo="date"
            valore={valori.dataPrestazione}
            onChange={cambiaGiorno}
            errore={errori.dataPrestazione}
          />
        )}
        {!altroGiorno && errori.dataPrestazione && (
          <p className="text-sm font-medium text-red-600">{errori.dataPrestazione}</p>
        )}

        {tempi.stato === 'oltre il termine' && (
          <Banner tono="errore">
            Sono passati {tempi.giorni} giorni: la fattura andava fatta entro {GIORNI_EMISSIONE}.
            Mandala lo stesso, e la prossima volta mandala subito.
          </Banner>
        )}
        {tempi.stato === 'in ritardo' && (
          <Banner tono="avviso">
            Sono passati {tempi.giorni} giorni. Va ancora bene, ma la prossima volta mandala prima.
          </Banner>
        )}
        {tempi.stato === 'futura' && (
          <Banner tono="info">Il giorno che hai scelto deve ancora arrivare: è giusto?</Banner>
        )}
      </Domanda>

      <Domanda titolo="Il cliente ha già pagato?">
        <BottoniScelta
          opzioni={[
            { valore: 'si', etichetta: 'Sì, ha già pagato' },
            { valore: 'no', etichetta: 'No, deve ancora pagare' },
          ]}
          valore={pagatoRisposto ? (valori.incassato ? 'si' : 'no') : ''}
          onScegli={(v) => onRispostaPagato(v === 'si')}
          errore={errori.incassato}
        />
      </Domanda>

      {valori.incassato && (
        <Domanda titolo="Come ha pagato?">
          <BottoniScelta
            colonne={2}
            opzioni={MEZZI_PAGAMENTO.map((m) => ({ valore: m, etichetta: m }))}
            valore={valori.mezzoPagamento}
            onScegli={(v) => set('mezzoPagamento', v)}
            errore={errori.mezzoPagamento}
          />
          {valori.mezzoPagamento === MEZZO_ALTRO && (
            <Campo
              grande
              etichetta="Come ha pagato?"
              valore={valori.mezzoPagamentoAltro}
              onChange={(v) => set('mezzoPagamentoAltro', v)}
              segnaposto="Es. buono pasto, PayPal"
              errore={errori.mezzoPagamentoAltro}
            />
          )}
          {!incassoDiverso ? (
            <Link onClick={() => setIncassoDiverso(true)}>Ha pagato in un altro giorno?</Link>
          ) : (
            <Campo
              grande
              etichetta="Che giorno ha pagato?"
              tipo="date"
              valore={valori.dataIncasso}
              onChange={(v) => set('dataIncasso', v)}
              errore={errori.dataIncasso}
            />
          )}
        </Domanda>
      )}
    </div>
  )
}
