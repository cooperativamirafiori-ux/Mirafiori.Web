'use client'

/**
 * La scheda di una SIM: numero e ICCID, piano e costo, chi la usa, storico.
 *
 * Delle 46 SIM di partenza, 41 non erano mai state assegnate e a quasi tutte
 * mancava operatore, piano e costo: questa schermata esiste per colmare quei
 * buchi una riga per volta, senza un giro di bonifica in Excel.
 */

import { useState } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Campo } from '@/components/ui/Campo'
import { Pill } from '@/components/ui/Pill'
import type { VoceRubrica } from '@/lib/core/rubrica'
import type { RigaSim } from '@/lib/it/data'
import { euro } from '@/types/acquisti'
import {
  STATI_SIM,
  STATO_SIM_STILE,
  TIPI_PIANO,
  chiLoHa,
  type Assegnazione,
  type CentroDiCostoVoce,
  type Sim,
  type StatoSim,
  type TipoPiano,
} from '@/types/it'
import { ModaleAssegna } from './ModaleAssegna'
import { Storico } from './Storico'
import { salvaSim } from './azioni'

export function SchedaSim({
  riga,
  storico,
  centriDiCosto,
  rubrica,
  dispositivi,
  onSim,
  onAssegnazione,
}: {
  riga: RigaSim
  storico: Assegnazione[]
  centriDiCosto: CentroDiCostoVoce[]
  rubrica: VoceRubrica[]
  /** Gli smartphone e i tablet in cui la scheda può stare. */
  dispositivi: Array<{ id: number; etichetta: string }>
  onSim: (s: Sim) => void
  onAssegnazione: (a: Assegnazione) => void
}) {
  const { sim, attiva } = riga
  const [aperta, setAperta] = useState(false)
  const [assegnando, setAssegnando] = useState(false)
  const [correggendo, setCorreggendo] = useState<Assegnazione | null>(null)

  const incompleta = !sim.operatore || !sim.tipoPiano || sim.costoMensile == null

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setAperta(!aperta)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-gray-700">{sim.numero}</span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                STATO_SIM_STILE[sim.stato] ?? ''
              }`}
            >
              {sim.stato}
            </span>
            {sim.operatore && <Pill text={sim.operatore} tono="azzurro" />}
            {!attiva && <Pill text="non assegnata" tono="neutro" />}
            {incompleta && <Pill text="dati da completare" tono="ambra" />}
          </div>
          <p className="text-sm text-gray-800 font-medium mt-1 truncate">{chiLoHa(attiva)}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {[
              sim.nomePiano,
              sim.costoMensile != null ? `${euro(sim.costoMensile)}/mese` : null,
              attiva?.centroDiCosto?.value,
              sim.beneAssociato?.value ? `in ${sim.beneAssociato.value}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || `ICCID ${sim.iccid}`}
          </p>
        </div>
        <span className="text-gray-300 text-sm shrink-0">{aperta ? '▲' : '▼'}</span>
      </button>

      {aperta && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50/50">
          <DatiSim sim={sim} dispositivi={dispositivi} onSim={onSim} />

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700">Storico delle assegnazioni</p>
              <button
                onClick={() => setAssegnando(true)}
                className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-semibold"
              >
                {attiva ? 'Riassegna' : 'Assegna'}
              </button>
            </div>
            <Storico
              genere="sim"
              storico={storico}
              onAggiornata={onAssegnazione}
              onCorreggi={setCorreggendo}
            />
          </div>
        </div>
      )}

      {assegnando && (
        <ModaleAssegna
          genere="sim"
          oggettoId={Number(sim.spItemId)}
          etichetta={sim.numero}
          centriDiCosto={centriDiCosto}
          rubrica={rubrica}
          onFatto={onAssegnazione}
          onChiudi={() => setAssegnando(false)}
        />
      )}
      {correggendo && (
        <ModaleAssegna
          genere="sim"
          oggettoId={Number(sim.spItemId)}
          etichetta={sim.numero}
          precedente={correggendo}
          centriDiCosto={centriDiCosto}
          rubrica={rubrica}
          onFatto={onAssegnazione}
          onChiudi={() => setCorreggendo(null)}
        />
      )}
    </div>
  )
}

function DatiSim({
  sim,
  dispositivi,
  onSim,
}: {
  sim: Sim
  dispositivi: Array<{ id: number; etichetta: string }>
  onSim: (s: Sim) => void
}) {
  const [f, setF] = useState({
    numero: sim.numero,
    operatore: sim.operatore ?? '',
    tipoPiano: (sim.tipoPiano ?? '') as string,
    nomePiano: sim.nomePiano ?? '',
    fornitore: sim.fornitore ?? '',
    dataAttivazione: sim.dataAttivazione?.slice(0, 10) ?? '',
    riferimentoContratto: sim.riferimentoContratto ?? '',
    stato: sim.stato as string,
    costoMensile: sim.costoMensile != null ? String(sim.costoMensile) : '',
    beneAssociatoId: String(sim.beneAssociato?.id ?? ''),
    note: sim.note ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [salvato, setSalvato] = useState(false)

  const set = (k: keyof typeof f, v: string) => {
    setF((s) => ({ ...s, [k]: v }))
    setSalvato(false)
  }

  async function salva() {
    setBusy(true)
    setErrore(null)
    try {
      onSim(
        await salvaSim(sim.spItemId, {
          numero: f.numero,
          operatore: f.operatore,
          tipoPiano: (f.tipoPiano || undefined) as TipoPiano | undefined,
          nomePiano: f.nomePiano,
          fornitore: f.fornitore,
          dataAttivazione: f.dataAttivazione || null,
          riferimentoContratto: f.riferimentoContratto,
          stato: f.stato as StatoSim,
          costoMensile: f.costoMensile === '' ? null : Number(f.costoMensile),
          beneAssociatoId: f.beneAssociatoId ? Number(f.beneAssociatoId) : null,
          note: f.note,
        }),
      )
      setSalvato(true)
    } catch (e: any) {
      setErrore(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 bg-white rounded-lg border border-gray-100 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-gray-700">Dati della SIM</p>
        <p className="text-[11px] text-gray-400 font-mono">ICCID {sim.iccid}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5">
        <Campo etichetta="Numero" valore={f.numero} onChange={(v) => set('numero', v)} obbligatorio tipo="tel" />
        <Campo etichetta="Operatore" valore={f.operatore} onChange={(v) => set('operatore', v)} segnaposto="TIM, Vodafone…" />
        <Campo etichetta="Tipo piano" tipo="choice" valore={f.tipoPiano} onChange={(v) => set('tipoPiano', v)} scelte={TIPI_PIANO} />
        <Campo etichetta="Nome piano" valore={f.nomePiano} onChange={(v) => set('nomePiano', v)} />
        <Campo etichetta="Costo mensile" tipo="currency" valore={f.costoMensile} onChange={(v) => set('costoMensile', v)} />
        <Campo etichetta="Fornitore / intermediario" valore={f.fornitore} onChange={(v) => set('fornitore', v)} />
        <Campo etichetta="Data attivazione" tipo="date" valore={f.dataAttivazione} onChange={(v) => set('dataAttivazione', v)} />
        <Campo etichetta="Riferimento contratto" valore={f.riferimentoContratto} onChange={(v) => set('riferimentoContratto', v)} />
        <Campo
          etichetta="Stato"
          tipo="choice"
          valore={f.stato}
          onChange={(v) => set('stato', v)}
          scelte={STATI_SIM}
          senzaVuoto
          aiuto="Passando a “Cessata” la data di cessazione si mette da sé."
        />
        <Campo
          etichetta="Sta nel dispositivo"
          tipo="choice"
          valore={f.beneAssociatoId}
          onChange={(v) => set('beneAssociatoId', v)}
          scelte={dispositivi.map((d) => ({ valore: String(d.id), etichetta: d.etichetta }))}
        />
      </div>

      <Campo etichetta="Note" tipo="textarea" righe={2} valore={f.note} onChange={(v) => set('note', v)} />

      <Banner tono="errore">{errore}</Banner>

      <button
        onClick={salva}
        disabled={busy}
        className="w-full bg-gray-800 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
      >
        {busy ? 'Salvo…' : salvato ? 'Salvato ✓' : 'Salva i dati della SIM'}
      </button>
    </div>
  )
}
