'use client'

/**
 * Passo «Come riceve la fattura?» — codice destinatario, PEC, email, telefono.
 *
 * **Per chi ha partita IVA e per gli enti** (italiani) serve almeno uno fra
 * codice destinatario e PEC: è la strada con cui la fattura elettronica arriva
 * al cliente, e senza non si invia (decisione del 24 settembre 2026, la regola è
 * `chiedeCanaleSdi` in types/fatture.ts). Il modulo lo dice prima, non dopo:
 * è la domanda principale del passo, con la spiegazione di dove trovarli.
 *
 * **Per i privati e gli esteri** codice e PEC non servono: il passo chiede solo
 * email e telefono, facoltativi, e codice e PEC stanno dietro un link per chi
 * li ha.
 */

import { useState } from 'react'
import { Campo } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import { chiedeCanaleSdi, type NuovaRichiestaFatturaInput } from '@/types/fatture'
import { Domanda, Link } from '@/components/ui/Bottoni'

type Set = <K extends keyof NuovaRichiestaFatturaInput>(k: K, v: NuovaRichiestaFatturaInput[K]) => void

export function PassoRecapiti({
  valori,
  errori,
  set,
}: {
  valori: NuovaRichiestaFatturaInput
  errori: Record<string, string>
  set: Set
}) {
  const serveCanale = chiedeCanaleSdi(valori)
  const [mostraCanale, setMostraCanale] = useState(Boolean(valori.codiceSdi || valori.pec))
  const mancaCanale = Boolean(errori.codiceSdi) && !valori.codiceSdi && !valori.pec

  const canale = (
    <div className="space-y-4">
      <Campo
        grande
        etichetta="Codice destinatario"
        valore={valori.codiceSdi}
        onChange={(v) => set('codiceSdi', v.replace(/\s/g, ''))}
        errore={mancaCanale ? undefined : errori.codiceSdi}
        maiuscolo
        maxLength={7}
        aiuto="7 lettere e numeri (6 per gli enti pubblici)."
      />
      <p className="text-base font-semibold text-gray-500">oppure</p>
      <Campo
        grande
        etichetta="PEC"
        tipo="email"
        valore={valori.pec}
        onChange={(v) => set('pec', v.trim())}
        errore={errori.pec}
        segnaposto="nome@pec.it"
      />
    </div>
  )

  return (
    <div className="space-y-7">
      {serveCanale ? (
        <Domanda
          titolo="Come riceve la fattura?"
          spiegazione="Serve il codice destinatario oppure la PEC. Il cliente li trova sulle fatture che riceve, o li sa il suo commercialista."
        >
          {mancaCanale && (
            <Banner tono="errore">
              <span className="text-base">
                Senza codice o PEC la richiesta non può partire. Chiedili al cliente.
              </span>
            </Banner>
          )}
          {canale}
        </Domanda>
      ) : null}

      <Domanda
        titolo={serveCanale ? 'Altri contatti (se li hai)' : 'Contatti del cliente (se li hai)'}
        spiegazione={serveCanale ? undefined : 'Non sono obbligatori: se non li sai, vai avanti.'}
      >
        <div className="space-y-5">
          <Campo
            grande
            etichetta="Email"
            tipo="email"
            valore={valori.email}
            onChange={(v) => set('email', v.trim())}
            errore={errori.email}
          />
          <Campo
            grande
            etichetta="Telefono"
            tipo="tel"
            valore={valori.telefono}
            onChange={(v) => set('telefono', v)}
            errore={errori.telefono}
          />
          {!serveCanale &&
            (mostraCanale ? (
              canale
            ) : (
              <Link onClick={() => setMostraCanale(true)}>Il cliente ha un codice destinatario o una PEC?</Link>
            ))}
        </div>
      </Domanda>
    </div>
  )
}
