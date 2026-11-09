'use client'

/**
 * Come si dividono le ore settimanali fra i servizi, per chi non timbra e
 * lavora su più centri di costo (i responsabili d'area).
 *
 * In ore settimanali, non in percentuale: è come lo dicono le HR ("20 ore su
 * Ed. amb. Nord, 18 su Progettazione"). La somma deve fare il totale della
 * settimana — lo ricontrolla il server — e "Compila il mese" divide ogni
 * giornata nelle stesse proporzioni.
 *
 * Vuota = non serve: vale il servizio scritto sulle fasce, come prima.
 */

import type { RipartizioneOre as Quota, Servizio } from '@/types/timbrature'

const oreFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))

/** Riga in composizione: le ore restano testo finché si scrive ("20," a metà). */
export interface RigaRipartizione {
  servizioId: number | ''
  ore: string
}

export const daQuote = (q: Quota[]): RigaRipartizione[] =>
  q.map((x) => ({ servizioId: x.servizioId, ore: String(x.oreSettimanali) }))

export const aQuote = (r: RigaRipartizione[]): Quota[] =>
  r
    .filter((x) => x.servizioId !== '' || x.ore.trim() !== '')
    .map((x) => ({ servizioId: Number(x.servizioId), oreSettimanali: Number(x.ore.replace(',', '.')) || 0 }))

export function RipartizioneOre({
  righe,
  servizi,
  settimanali,
  onChange,
  disabilitato,
}: {
  righe: RigaRipartizione[]
  servizi: Servizio[]
  /** Totale settimanale dell'orario teorico: è quello che la ripartizione deve fare. */
  settimanali: number
  onChange: (r: RigaRipartizione[]) => void
  disabilitato?: boolean
}) {
  const lavoro = servizi.filter((s) => s.tipoVoce === 'lavoro')
  const somma = aQuote(righe).reduce((t, q) => t + q.oreSettimanali, 0)
  const differenza = Math.round((settimanali - somma) * 100) / 100

  const cambia = (i: number, r: Partial<RigaRipartizione>) =>
    onChange(righe.map((x, j) => (j === i ? { ...x, ...r } : x)))

  return (
    <div className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50/50">
      <div className="font-semibold text-gray-700 text-sm mb-1">Ore per servizio (centro di costo)</div>
      <p className="text-xs text-gray-500 mb-3">
        Per chi divide il lavoro su più servizi. Scrivi quante ore a settimana vanno su ciascuno:
        “Compila il mese” divide ogni giornata in queste proporzioni, e il servizio scritto sulle
        fasce non conta più. Lascia vuoto se lavora su un servizio solo.
      </p>

      {righe.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2 mb-2">
          <label className="text-[11px] text-gray-500 flex-1 min-w-[180px]">
            Servizio
            <select
              value={r.servizioId}
              disabled={disabilitato}
              onChange={(e) => cambia(i, { servizioId: e.target.value ? Number(e.target.value) : '' })}
              className="block w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5"
            >
              <option value="">— scegli —</option>
              {lavoro.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-gray-500 w-24">
            Ore/sett.
            <input
              value={r.ore}
              disabled={disabilitato}
              onChange={(e) => cambia(i, { ore: e.target.value })}
              inputMode="decimal"
              className="block w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5 text-right"
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(righe.filter((_, j) => j !== i))}
            disabled={disabilitato}
            className="text-xs text-red-500 hover:text-red-700 pb-2 disabled:opacity-50"
          >
            togli
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...righe, { servizioId: '', ore: righe.length ? '' : oreFmt(settimanali) }])}
        disabled={disabilitato}
        className="text-xs text-brand-cyan-dark hover:underline disabled:opacity-50"
      >
        + aggiungi un servizio
      </button>

      {righe.length > 0 && (
        <p className={`text-xs mt-2 ${differenza === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
          {differenza === 0
            ? `✓ ${oreFmt(somma)} h su ${oreFmt(settimanali)} h settimanali`
            : differenza > 0
              ? `Mancano ${oreFmt(differenza)} h: la somma deve fare ${oreFmt(settimanali)} h`
              : `${oreFmt(-differenza)} h di troppo: la somma deve fare ${oreFmt(settimanali)} h`}
        </p>
      )}
    </div>
  )
}
