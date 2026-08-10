'use client'

/**
 * Il riepilogo del mese, uguale per il dipendente e per chi valida.
 *
 * Prima erano due blocchi diversi che raccontavano gli stessi fatti: il
 * dipendente aveva tre KPI, un riquadro flessibilita' e l'elenco dei
 * giustificativi; il cruscotto RU sei piastrelle piu' piccole con altri nomi
 * ("Differenza" invece di "Scostamento"), il punto al posto della virgola, la
 * flessibilita' ridotta al solo saldo e niente elenco delle voci disponibili.
 * Chi validava vedeva meno di chi compilava, che e' il contrario di come
 * dovrebbe essere.
 *
 * Il criterio di scrittura e' uno solo: **deve essere chiaro a un neo-assunto**.
 * Da qui la frase in italiano in cima, le etichette senza gergo ("Ore da fare"
 * invece di "Ore attese"), le voci di assenza tutte elencate anche a zero — non
 * si puo' usare quello che non si sa di avere — e il segno spiegato a parole
 * invece che lasciato a un "+/-" da interpretare.
 */

import { useMemo } from 'react'
import { Kpi } from '@/components/ui/Kpi'
import { Pill } from '@/components/ui/Pill'
import type { RiepilogoPeriodo, Servizio, Timbratura } from '@/types/timbrature'
import {
  VOCE_FLESSIBILITA,
  VOCE_NON_RETRIBUITA,
  VOCI_CON_RESIDUO,
  dataEstesa,
  fmtRange,
  gg,
  frasiSintesi,
  oreLabel,
  periodoEsteso,
  ritagliaAOggi,
  scostClasse,
  segno,
} from './mese'

const TONO_BANNER = {
  ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  avviso: 'bg-amber-50 border-amber-200 text-amber-900',
  info: 'bg-gray-50 border-gray-200 text-gray-600',
} as const

function Titolo({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{children}</div>
  )
}

export function RiepilogoMese({
  riepilogo,
  timbrature,
  servizi,
  nome,
  oggi,
}: {
  riepilogo: RiepilogoPeriodo
  timbrature: Timbratura[]
  /** Serve a elencare anche le voci di assenza non usate: vedi § assenze. */
  servizi: Servizio[]
  /** Nome della persona quando si guarda il foglio di qualcun altro. */
  nome?: string
  /** Giorno a cui fermare il conteggio; default: oggi. */
  oggi?: string
}) {
  const r = useMemo(() => ritagliaAOggi(riepilogo, timbrature, oggi), [riepilogo, timbrature, oggi])
  const sintesi = frasiSintesi(r, nome)

  /** Il periodo conteggiato, da scrivere sopra i numeri. */
  const periodo = useMemo(() => {
    const primo = riepilogo.giorni[0]?.data
    if (!primo) return ''
    const esteso = periodoEsteso(primo, r.finoA)
    return r.inCorso
      ? `Conteggio ${esteso} — i giorni che restano non sono ancora contati`
      : `Conteggio di tutto il mese, ${esteso}`
  }, [riepilogo.giorni, r.finoA, r.inCorso])

  /**
   * Tutte le voci di assenza, anche quelle a zero.
   *
   * L'elenco viene dai servizi, non dalle ore registrate: un neo-assunto non sa
   * che esistono la Legge 104 o le ex festivita' finche' non le vede scritte, e
   * una tabella che cambia forma ogni mese non si impara mai. La Flessibilita'
   * resta fuori perche' non e' un permesso ma un prelievo dal proprio monte, e
   * ha un riquadro suo: prima compariva in tutti e due i posti con due numeri
   * diversi (il saldo di qua, le ore consumate di la').
   */
  const assenze = useMemo(() => {
    const ore = new Map(r.giustificativi.map((v) => [v.nome, v.ore]))
    return servizi
      .filter((s) => s.tipoVoce === 'giustificativo' && s.nome !== VOCE_FLESSIBILITA)
      .sort((a, b) => a.ordine - b.ordine)
      .map((s) => ({ nome: s.nome, ore: ore.get(s.nome) ?? 0 }))
  }, [servizi, r.giustificativi])

  const totaleAssenze = assenze.reduce((s, v) => s + v.ore, 0)
  const scoperti = r.giorniScoperti.length

  return (
    <div className="space-y-4">
      {/*
        La risposta in italiano, prima di qualunque numero. Il periodo NON si
        ripete qui: sta sopra le schede, che e' il punto in cui serve.
      */}
      <div className={`rounded-xl border px-4 py-3 ${TONO_BANNER[sintesi.tono]}`}>
        <div className="text-sm font-semibold">{sintesi.titolo}</div>
      </div>

      {/*
        Le tre grandezze, col periodo scritto sopra.
        Senza l'intestazione "dal 1 al 10 agosto" le 24 ore da fare sembrano il
        monte ore dell'intero mese, e il confronto con le ore gia' registrate
        non si capisce.
      */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5 px-1">
          {periodo}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Kpi titolo="Ore da fare" valore={`${oreLabel(r.oreAttese)} h`} accento="slate" />
          <Kpi titolo="Ore fatte" valore={`${oreLabel(r.oreLavorate + r.oreGiustificativo)} h`} accento="cyan" />
          <Kpi
            titolo="Scostamento"
            valore={`${segno(r.scostamento)} h`}
            accento={r.scostamento < -0.001 ? 'red' : r.scostamento > 0.001 ? 'emerald' : 'slate'}
          />
        </div>
        {/*
          Senza questa riga la somma non torna a occhio: le schede mostravano
          "4" e "63" e uno scostamento di "-56", perche' nel conto entrano anche
          ferie e permessi — che coprono il monte ore ma non sono ore lavorate.
        */}
        <p className="text-[11px] text-gray-500 mt-1.5 px-1">
          Nelle ore fatte ci sono {oreLabel(r.oreLavorate)} h di lavoro e{' '}
          {oreLabel(r.oreGiustificativo)} h fra ferie, permessi e altre assenze giustificate: anche
          quelle coprono le ore previste.
        </p>
      </div>

      {/* Cosa manca, e le voci che finiscono in busta paga. */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi
          titolo={scoperti === 1 ? 'Giornata da sistemare' : 'Giornate da sistemare'}
          valore={scoperti || '—'}
          accento={scoperti > 0 ? 'red' : 'slate'}
        />
        <Kpi titolo="Notti" valore={r.notti || '—'} accento={r.notti ? 'violet' : 'slate'} />
        <Kpi
          titolo="Turni in reperibilità"
          valore={r.turniReperibilita || '—'}
          accento={r.turniReperibilita ? 'violet' : 'slate'}
        />
      </div>
      {scoperti > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 -mt-1">
          Giornate lavorative senza ore registrate:{' '}
          <strong>{r.giorniScoperti.map(gg).join(', ')}</strong>. Se non rientrano più nei tre
          giorni di modifica, vanno segnalate al proprio responsabile: è l&apos;unico che può
          ancora aggiungerle.
        </p>
      )}

      {/* Flessibilita': due movimenti opposti, non un numero solo. */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Flessibilità</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scostClasse(r.flessibilitaSaldo)}`}>
            {segno(r.flessibilitaSaldo)} h
          </span>
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Ore in più (accumulate)</span>
            <span className={`font-semibold ${r.flessibilitaLavorata ? 'text-emerald-700' : 'text-gray-400'}`}>
              {r.flessibilitaLavorata ? '+' : ''}{oreLabel(r.flessibilitaLavorata)} h
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Ore recuperate (usate)</span>
            <span className={`font-semibold ${r.flessibilitaRecuperata ? 'text-red-700' : 'text-gray-400'}`}>
              {r.flessibilitaRecuperata ? '−' : ''}{oreLabel(r.flessibilitaRecuperata)} h
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            <span className="text-gray-700 font-medium">Saldo di questo mese</span>
            <span className="font-bold text-gray-800">{segno(r.flessibilitaSaldo)} h</span>
          </div>
          {/*
            Il residuo sta qui e non nella tabella delle assenze: la
            Flessibilita' e' fuori da quella tabella, e senza questa riga il suo
            monte residuo non si vedrebbe da nessuna parte.
          */}
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Monte residuo (da cedolino)</span>
            <span className="text-gray-300 font-semibold">—</span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          Le ore in più si accumulano da sole quando si lavora oltre l&apos;orario previsto; le ore
          recuperate sono quelle registrate con la voce «Flessibilità». È il movimento di questo
          mese, non il totale disponibile.
        </p>
      </div>

      {/* Assenze: tutte le voci, sempre nella stessa posizione. */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Ferie, permessi e assenze</span>
          <span className="text-sm font-semibold text-accent-purple">{oreLabel(totaleAssenze)} h</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-400">
              <th className="text-left font-semibold pb-1">Voce</th>
              <th className="text-right font-semibold pb-1 w-24">Usate</th>
              <th className="text-right font-semibold pb-1 w-24">Residuo</th>
            </tr>
          </thead>
          <tbody>
            {assenze.map((v) => {
              const usata = v.ore > 0.0001
              return (
                <tr key={v.nome} className="border-t border-gray-50">
                  <td className={`py-1.5 ${usata ? 'text-accent-purple font-medium' : 'text-gray-400'}`}>
                    {v.nome === 'Fest.Sopp.' ? 'Ex festività (Fest.Sopp.)' : v.nome}
                    {v.nome === VOCE_NON_RETRIBUITA && (
                      <span className="ml-2 align-middle">
                        <Pill text="non retribuito" tono="ambra" />
                      </span>
                    )}
                  </td>
                  <td className={`text-right py-1.5 font-semibold ${usata ? 'text-gray-700' : 'text-gray-300'}`}>
                    {usata ? `${oreLabel(v.ore)} h` : '—'}
                  </td>
                  <td className="text-right py-1.5 text-gray-300">
                    {VOCI_CON_RESIDUO.includes(v.nome) ? '—' : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-gray-400">
          Le voci in grigio non sono state usate in questo mese. La colonna «Residuo» si compilerà
          con i dati del cedolino: il collegamento non è ancora attivo.
        </p>
      </div>

      {/* Settimane. */}
      {r.settimane.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3">
          <Titolo>Settimana per settimana</Titolo>
          <div className="space-y-1.5">
            {r.settimane.map((w) => (
              <div key={w.inizio} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {fmtRange(w.inizio, w.fine)}
                  {!w.conclusa && <span className="text-gray-400 italic ml-1.5 text-xs">in corso</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-gray-400">
                    {oreLabel(w.oreLavorate + w.oreGiustificativo)}/{oreLabel(w.oreAttese)} h
                  </span>
                  <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${scostClasse(w.scostamento)}`}>
                    {segno(w.scostamento)} h
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
