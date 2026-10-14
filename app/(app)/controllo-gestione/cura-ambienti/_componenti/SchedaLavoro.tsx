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
 *
 * "Si ripete": ogni mese oppure ogni settimana in un giorno fisso. Per il
 * settimanale le ore del preventivo si scrivono PER VOLTA e il mese le
 * moltiplica per le volte che quel giorno cade (4 o 5). Pausa e chiusura
 * della ricorrenza stanno nella sezione Ricorrenti, non qui.
 */

import { useState } from 'react'
import { Modale } from '@/components/ui/Modale'
import { Campo } from '@/components/ui/Campo'
import { Banner } from '@/components/ui/Banner'
import { Pill } from '@/components/ui/Pill'
import { importo, modificabile, passaggiDa, tariffeDi, volteNelMese } from '@/lib/cura-ambienti/flusso'
import {
  GIORNI_SETTIMANA,
  STATI_LAVORO,
  type LavoroConImporti,
  type StatoLavoro,
  type StrutturaScelta,
  type Tariffe,
  type TariffeStrutture,
} from '@/types/cura-ambienti'
import { euro, nomeMese, ore } from './formato'

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
  tariffeStrutture,
  onChiudi,
  onSalvato,
}: {
  lavoro: LavoroConImporti | null
  mese: string
  strutture: StrutturaScelta[]
  tariffe: Tariffe
  tariffeStrutture: TariffeStrutture
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
  const legato = !!lavoro?.ricorrenzaId
  const meseLavoro = lavoro?.mese ?? mese
  const [frequenza, setFrequenza] = useState<string>(
    lavoro?.frequenza ?? (lavoro?.ricorrente ? 'mensile' : 'no'),
  )
  const [giorno, setGiorno] = useState(s(lavoro?.giornoSettimana ?? null))
  // Un settimanale salvato ha le ore del mese: nella scheda tornano per volta.
  const voltePrima =
    lavoro?.frequenza === 'settimanale' && lavoro.giornoSettimana ? volteNelMese(lavoro.mese, lavoro.giornoSettimana) : 1
  const perVolta = (n: number | undefined) => (n === undefined ? null : Math.round((n / voltePrima) * 100) / 100)
  const [pP, setPP] = useState(s(perVolta(lavoro?.prevOrePulizie)))
  const [pM, setPM] = useState(s(perVolta(lavoro?.prevOreManutenzione)))
  const [pMat, setPMat] = useState(s(lavoro?.prevMateriali ?? null))
  const [cP, setCP] = useState(s(lavoro?.consOrePulizie))
  const [cM, setCM] = useState(s(lavoro?.consOreManutenzione))
  const [cMat, setCMat] = useState(s(lavoro?.consMateriali))
  const [noteCons, setNoteCons] = useState(lavoro?.noteConsuntivo ?? '')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')

  const mostraConsuntivo = !nuovo && stato !== 'bozza'
  const settimanale = frequenza === 'settimanale'
  const volteMese = settimanale && giorno ? volteNelMese(meseLavoro, Number(giorno)) : 1
  const t = tariffeDi(tariffe, tariffeStrutture, destinatario === 'struttura' ? strutturaCodice || null : null)
  const tariffaPropria = destinatario === 'struttura' && !!strutturaCodice && !!tariffeStrutture[strutturaCodice]
  const prev = importo(num(pP) * volteMese, num(pM) * volteMese, num(pMat), t)
  const consScritto = cP.trim() !== '' || cM.trim() !== '' || cMat.trim() !== ''
  const cons = consScritto ? importo(num(cP), num(cM), num(cMat), t) : null

  const dati = () => ({
    mese: lavoro?.mese ?? mese,
    destinatario,
    strutturaCodice: destinatario === 'struttura' ? strutturaCodice : null,
    cliente: destinatario === 'esterno' ? cliente : null,
    titolo,
    descrizione,
    frequenza: frequenza === 'no' ? null : frequenza,
    giornoSettimana: settimanale ? Number(giorno) || null : null,
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
    t.pulizie === t.manutenzione
      ? `${euro(t.pulizie)}/h`
      : `pulizie ${euro(t.pulizie)}/h · manutenzione ${euro(t.manutenzione)}/h`
  const sceltaFrequenza = [
    ...(legato ? [] : [{ valore: 'no', etichetta: 'No, una volta sola' }]),
    { valore: 'mensile', etichetta: 'Ogni mese' },
    { valore: 'settimanale', etichetta: 'Ogni settimana' },
  ]
  const nomeGiorno = giorno ? GIORNI_SETTIMANA[Number(giorno) - 1] : ''

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
        <Campo
          etichetta="Si ripete"
          tipo="choice"
          valore={frequenza}
          onChange={setFrequenza}
          scelte={sceltaFrequenza}
          senzaVuoto
          aiuto={
            legato
              ? 'Le modifiche valgono anche per i prossimi mesi. Pausa e stop dalla sezione Ricorrenti, in cima alla pagina.'
              : 'Le pulizie ordinarie: il lavoro si ricrea da solo nei mesi seguenti.'
          }
          disabilitato={!aperto}
        />
        {settimanale && (
          <Campo
            etichetta="Che giorno"
            tipo="choice"
            valore={giorno}
            onChange={setGiorno}
            scelte={GIORNI_SETTIMANA.map((g, i) => ({ valore: String(i + 1), etichetta: g }))}
            obbligatorio
            disabilitato={!aperto}
          />
        )}
        {tariffaPropria && (
          <Banner tono="info">
            Tariffa propria di questa struttura: pulizie {euro(t.pulizie)}/h, perché i detersivi li ordina a parte sul suo
            centro di costo.
          </Banner>
        )}

        <fieldset className="rounded-xl border border-gray-200 p-3 space-y-3">
          <legend className="px-1 text-sm font-semibold text-gray-700">Preventivo</legend>
          <div className="grid grid-cols-2 gap-3">
            <Campo
              etichetta={settimanale ? 'Ore pulizie ogni volta' : 'Ore pulizie'}
              tipo="number"
              inputMode="decimal"
              min={0}
              valore={pP}
              onChange={setPP}
              disabilitato={!aperto}
            />
            <Campo
              etichetta={settimanale ? 'Ore manutenzione ogni volta' : 'Ore manutenzione'}
              tipo="number"
              inputMode="decimal"
              min={0}
              valore={pM}
              onChange={setPM}
              disabilitato={!aperto}
            />
          </div>
          {settimanale && giorno && (
            <p className="text-sm text-gray-600">
              A {nomeMese(meseLavoro)} i {nomeGiorno} sono <b>{volteMese}</b>: nel mese{' '}
              <b>{ore(Math.round((num(pP) + num(pM)) * volteMese * 100) / 100)}</b>.
            </p>
          )}
          <Campo
            etichetta={settimanale ? 'Materiali dedicati nel mese (€)' : 'Materiali dedicati (€)'}
            tipo="currency"
            inputMode="decimal"
            min={0}
            valore={pMat}
            onChange={setPMat}
            aiuto={
              tariffaPropria
                ? 'Solo quelli di questo lavoro. I detersivi no: la struttura li compra a parte.'
                : 'Solo quelli di questo lavoro: il materiale di consumo è già nella tariffa.'
            }
            disabilitato={!aperto}
          />
          <p className="text-sm text-gray-700">
            Importo preventivo{settimanale ? ' del mese' : ''}: <b>{euro(prev)}</b>
          </p>
        </fieldset>

        {mostraConsuntivo && (
          <fieldset className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
            <legend className="px-1 text-sm font-semibold text-emerald-800">Consuntivo{settimanale ? ' del mese' : ''}</legend>
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
