'use client'

/**
 * Scheda di un lavoro: per chi, cosa, preventivo, consuntivo, stato.
 *
 * L'importo si vede mentre si scrive (ore × tariffa del mese + materiali): è
 * il modo in cui il coordinatore impara a stimare. Il calcolo è lo stesso del
 * server (lib/cura-ambienti/flusso.ts), che resta quello che fa fede.
 *
 * I cambi di stato salvano prima i dati: "Chiudi il consuntivo" con le ore
 * appena scritte non deve perderle.
 */

import { useState } from 'react'
import { Modale } from '@/components/ui/Modale'
import { Campo } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import { Pill } from '@/components/ui/Pill'
import { Spunta } from '@/components/ui/Bottoni'
import { importo, modificabile, passaggiDa } from '@/lib/cura-ambienti/flusso'
import {
  STATI_LAVORO,
  type LavoroConImporti,
  type StatoLavoro,
  type StrutturaScelta,
  type Tariffe,
} from '@/types/cura-ambienti'
import { euro, nomeMese } from './formato'

const AZIONE: Partial<Record<StatoLavoro, string>> = {
  bozza: 'Riporta in bozza',
  preventivato: 'Segna come preventivato',
  in_corso: 'Segna in corso',
  consuntivato: 'Chiudi il consuntivo',
  annullato: 'Annulla il lavoro',
}

const s = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))
const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')))

export function SchedaLavoro({
  lavoro,
  mese,
  strutture,
  tariffe,
  onChiudi,
  onSalvato,
}: {
  lavoro: LavoroConImporti | null
  mese: string
  strutture: StrutturaScelta[]
  tariffe: Tariffe
  onChiudi: () => void
  onSalvato: (messaggio: string) => void
}) {
  const nuovo = lavoro === null
  const stato: StatoLavoro = lavoro?.stato ?? 'bozza'
  const aperto = modificabile(stato)

  const [destinatario, setDestinatario] = useState<string>(lavoro?.destinatario ?? 'struttura')
  const [strutturaCodice, setStrutturaCodice] = useState(lavoro?.strutturaCodice ?? '')
  const [cliente, setCliente] = useState(lavoro?.cliente ?? '')
  const [titolo, setTitolo] = useState(lavoro?.titolo ?? '')
  const [descrizione, setDescrizione] = useState(lavoro?.descrizione ?? '')
  const [ricorrente, setRicorrente] = useState(lavoro?.ricorrente ?? false)
  const [pP, setPP] = useState(s(lavoro?.prevOrePulizie ?? null))
  const [pM, setPM] = useState(s(lavoro?.prevOreManutenzione ?? null))
  const [pMat, setPMat] = useState(s(lavoro?.prevMateriali ?? null))
  const [cP, setCP] = useState(s(lavoro?.consOrePulizie))
  const [cM, setCM] = useState(s(lavoro?.consOreManutenzione))
  const [cMat, setCMat] = useState(s(lavoro?.consMateriali))
  const [noteCons, setNoteCons] = useState(lavoro?.noteConsuntivo ?? '')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')

  const mostraConsuntivo = !nuovo && stato !== 'bozza'
  const prev = importo(num(pP), num(pM), num(pMat), tariffe)
  const consScritto = cP.trim() !== '' || cM.trim() !== '' || cMat.trim() !== ''
  const cons = consScritto ? importo(num(cP), num(cM), num(cMat), tariffe) : null

  const dati = () => ({
    mese: lavoro?.mese ?? mese,
    destinatario,
    strutturaCodice: destinatario === 'struttura' ? strutturaCodice : null,
    cliente: destinatario === 'esterno' ? cliente : null,
    titolo,
    descrizione,
    ricorrente,
    prevOrePulizie: pP,
    prevOreManutenzione: pM,
    prevMateriali: pMat,
    consOrePulizie: cP,
    consOreManutenzione: cM,
    consMateriali: cMat,
    noteConsuntivo: noteCons,
  })

  async function chiama(url: string, metodo: 'POST' | 'PATCH', corpo: unknown) {
    const res = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j.error ?? 'Operazione non riuscita')
    return j
  }

  async function salva(poi?: StatoLavoro) {
    setInCorso(true)
    setErrore('')
    try {
      let id = lavoro?.id
      if (aperto) {
        const j = nuovo
          ? await chiama('/api/cura-ambienti/lavori', 'POST', dati())
          : await chiama(`/api/cura-ambienti/lavori/${id}`, 'PATCH', dati())
        id = j.lavoro.id
      }
      if (poi && id) await chiama(`/api/cura-ambienti/lavori/${id}`, 'PATCH', { stato: poi })
      onSalvato(poi ? `Lavoro: ${STATI_LAVORO[poi].etichetta.toLowerCase()}.` : nuovo ? 'Lavoro creato.' : 'Lavoro salvato.')
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione non riuscita')
    } finally {
      setInCorso(false)
    }
  }

  const sceltaStrutture = strutture.map((x) => ({
    valore: x.codice,
    etichetta: `${x.nome}${x.ccCodice ? ` · ${x.ccCodice}` : ' · senza centro di costo'}`,
  }))
  const tariffaTesto =
    tariffe.pulizie === tariffe.manutenzione
      ? `${euro(tariffe.pulizie)}/h`
      : `pulizie ${euro(tariffe.pulizie)}/h · manutenzione ${euro(tariffe.manutenzione)}/h`

  return (
    <Modale
      titolo={nuovo ? 'Nuovo lavoro' : `Lavoro #${lavoro.numero}`}
      sottotitolo={`Competenza ${nomeMese(lavoro?.mese ?? mese)} · tariffa ${tariffaTesto}`}
      onChiudi={onChiudi}
      azioni={
        <div className="flex flex-wrap gap-2 w-full">
          {aperto && (
            <button
              onClick={() => salva()}
              disabled={inCorso}
              className="grow px-4 py-2.5 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
            >
              {inCorso ? 'Salvo…' : 'Salva'}
            </button>
          )}
          {!nuovo &&
            passaggiDa(stato).map((a) => (
              <button
                key={a}
                onClick={() => salva(a)}
                disabled={inCorso}
                className={`grow px-4 py-2.5 rounded-xl font-semibold border disabled:opacity-50 ${
                  a === 'annullato'
                    ? 'border-red-200 text-red-700 bg-white'
                    : a === 'consuntivato'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-gray-300 text-gray-700 bg-white'
                }`}
              >
                {AZIONE[a] ?? a}
              </button>
            ))}
        </div>
      }
    >
      <div className="space-y-4">
        {!nuovo && (
          <div className="flex flex-wrap gap-2">
            <Pill text={STATI_LAVORO[stato].etichetta} tono={STATI_LAVORO[stato].tono} />
            {stato === 'addebitato' && <span className="text-xs text-gray-500">già nel registro, non si modifica</span>}
          </div>
        )}

        <Campo
          etichetta="Per chi"
          tipo="choice"
          valore={destinatario}
          onChange={setDestinatario}
          scelte={[
            { valore: 'struttura', etichetta: 'Una nostra struttura' },
            { valore: 'esterno', etichetta: 'Un cliente esterno' },
          ]}
          senzaVuoto
          disabilitato={!aperto}
        />
        {destinatario === 'struttura' ? (
          <Campo
            etichetta="Struttura"
            tipo="choice"
            valore={strutturaCodice}
            onChange={setStrutturaCodice}
            scelte={sceltaStrutture}
            obbligatorio
            aiuto="L'addebito va sul centro di costo della struttura."
            disabilitato={!aperto}
          />
        ) : (
          <Campo
            etichetta="Cliente"
            valore={cliente}
            onChange={setCliente}
            obbligatorio
            aiuto="Nessun addebito interno: a consuntivo servirà una richiesta fattura."
            disabilitato={!aperto}
          />
        )}
        <Campo
          etichetta="Che lavoro è"
          valore={titolo}
          onChange={setTitolo}
          obbligatorio
          segnaposto="Pulizia ordinaria, riparazione tapparella…"
          disabilitato={!aperto}
        />
        <Campo etichetta="Dettagli" tipo="textarea" valore={descrizione} onChange={setDescrizione} disabilitato={!aperto} />
        {aperto && (
          <Spunta etichetta="Si ripete ogni mese (pulizia ordinaria)" valore={ricorrente} onChange={setRicorrente} />
        )}

        <fieldset className="rounded-xl border border-gray-200 p-3 space-y-3">
          <legend className="px-1 text-sm font-semibold text-gray-700">Preventivo</legend>
          <div className="grid grid-cols-2 gap-3">
            <Campo etichetta="Ore pulizie" tipo="number" inputMode="decimal" min={0} valore={pP} onChange={setPP} disabilitato={!aperto} />
            <Campo etichetta="Ore manutenzione" tipo="number" inputMode="decimal" min={0} valore={pM} onChange={setPM} disabilitato={!aperto} />
          </div>
          <Campo
            etichetta="Materiali dedicati (€)"
            tipo="currency"
            inputMode="decimal"
            min={0}
            valore={pMat}
            onChange={setPMat}
            aiuto="Solo quelli di questo lavoro: il materiale di consumo è già nella tariffa."
            disabilitato={!aperto}
          />
          <p className="text-sm text-gray-700">
            Importo preventivo: <b>{euro(prev)}</b>
          </p>
        </fieldset>

        {mostraConsuntivo && (
          <fieldset className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
            <legend className="px-1 text-sm font-semibold text-emerald-800">Consuntivo</legend>
            <div className="grid grid-cols-2 gap-3">
              <Campo etichetta="Ore pulizie" tipo="number" inputMode="decimal" min={0} valore={cP} onChange={setCP} disabilitato={!aperto} />
              <Campo etichetta="Ore manutenzione" tipo="number" inputMode="decimal" min={0} valore={cM} onChange={setCM} disabilitato={!aperto} />
            </div>
            <Campo etichetta="Materiali dedicati (€)" tipo="currency" inputMode="decimal" min={0} valore={cMat} onChange={setCMat} disabilitato={!aperto} />
            <Campo etichetta="Note sul consuntivo" tipo="textarea" righe={2} valore={noteCons} onChange={setNoteCons} disabilitato={!aperto} />
            <p className="text-sm text-gray-700">
              Importo consuntivo: <b>{euro(cons)}</b>
              {prev !== null && cons !== null && cons !== prev && (
                <span className={cons > prev ? 'text-red-600' : 'text-emerald-700'}>
                  {' '}
                  ({cons > prev ? '+' : ''}
                  {euro(Math.round((cons - prev) * 100) / 100)} sul preventivo)
                </span>
              )}
            </p>
            {stato !== 'consuntivato' && (
              <p className="text-xs text-gray-500">Per chiudere servono tutti e tre i valori, anche zero.</p>
            )}
          </fieldset>
        )}

        <Banner tono="errore">{errore}</Banner>
      </div>
    </Modale>
  )
}
