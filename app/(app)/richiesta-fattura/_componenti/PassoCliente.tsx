'use client'

/**
 * Passo «Chi è il cliente?».
 *
 * Prima si cerca in archivio: se c'è, i dati si compilano da soli e il modulo
 * salta dritto al riepilogo. Se non c'è, due domande al posto della «tipologia
 * di soggetto», che è una parola da ufficio:
 *
 *   Una persona          → Ha la partita IVA?  No → Privato
 *                                              Sì → Persona fisica titolare di Partita IVA
 *   Un'azienda o un ente → Soggetto diverso da persona fisica
 *
 * Il valore salvato resta quello di `TIPI_SOGGETTO`: cambia la domanda, non il dato.
 */

import { useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import type { NuovaRichiestaFatturaInput, TipoSoggetto } from '@/types/fatture'
import type { Cliente, ClienteIndice } from '@/types/clienti'
import { BottoniScelta, Domanda, Link } from './Bottoni'
import { RicercaCliente } from './RicercaCliente'

type Chi = '' | 'persona' | 'azienda'

const chiDa = (t: TipoSoggetto | ''): Chi =>
  t === 'Soggetto diverso da persona fisica' ? 'azienda' : t ? 'persona' : ''

export function PassoCliente({
  valori,
  errori,
  clienti,
  scelto,
  onTipo,
  onScegliCliente,
  onScollega,
  onErrore,
}: {
  valori: NuovaRichiestaFatturaInput
  errori: Record<string, string>
  clienti: ClienteIndice[]
  /** Nome del cliente preso dall'archivio, o null. */
  scelto: string | null
  onTipo: (t: TipoSoggetto | '') => void
  onScegliCliente: (c: Cliente) => void
  onScollega: () => void
  onErrore: (m: string) => void
}) {
  const [chi, setChi] = useState<Chi>(chiDa(valori.tipoSoggetto))

  if (scelto) {
    return (
      <div className="space-y-4">
        <Banner tono="ok">
          <span className="text-base">
            Cliente trovato: <strong>{scelto}</strong>
          </span>
        </Banner>
        <Link onClick={onScollega}>Non è lui: cerco un altro cliente</Link>
      </div>
    )
  }

  return (
    <div className="space-y-7">
      <RicercaCliente clienti={clienti} onScegli={onScegliCliente} onErrore={onErrore} />

      <Domanda
        titolo={clienti.length ? 'Se è un cliente nuovo: chi è?' : 'Chi è il cliente?'}
      >
        <BottoniScelta
          opzioni={[
            { valore: 'persona', etichetta: 'Una persona' },
            {
              valore: 'azienda',
              etichetta: "Un'azienda o un ente",
              sotto: 'anche associazioni, scuole, comuni, condomini',
            },
          ]}
          valore={chi}
          onScegli={(v) => {
            const nuovo = v as Chi
            setChi(nuovo)
            onTipo(nuovo === 'azienda' ? 'Soggetto diverso da persona fisica' : '')
          }}
          errore={chi ? undefined : errori.tipoSoggetto}
        />
      </Domanda>

      {chi === 'persona' && (
        <Domanda
          titolo="Ha la partita IVA?"
          spiegazione="Di solito ce l'ha chi lavora in proprio: artigiani, professionisti, negozianti."
        >
          <BottoniScelta
            colonne={2}
            opzioni={[
              { valore: 'Privato', etichetta: 'No' },
              { valore: 'Persona fisica titolare di Partita IVA', etichetta: 'Sì' },
            ]}
            valore={valori.tipoSoggetto}
            onScegli={(v) => onTipo(v as TipoSoggetto)}
            errore={errori.tipoSoggetto ? 'Dicci se ha la partita IVA' : undefined}
          />
        </Domanda>
      )}
    </div>
  )
}
