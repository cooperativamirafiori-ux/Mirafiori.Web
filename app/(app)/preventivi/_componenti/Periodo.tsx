'use client'

/**
 * Inizio e durata. L'inizio spesso non si sa (Andrea, 18/11/2026): si spunta
 * "non si sa ancora" e nel documento esce "DA DEFINIRE"; i totali del periodo
 * si fanno sulla durata in mesi. Con l'inizio, la fine la calcola l'app.
 */

import { Campo, inputCls, labelCls } from '@/components/ui/Campo'
import { dataIt, fineDaDurata } from '@/lib/preventivi/calcoli'

const numeroDa = (v: string) => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function Periodo({
  dal,
  onDal,
  durata,
  onDurata,
  disabilitato,
  inizioProposto,
}: {
  dal: string
  onDal: (v: string) => void
  durata: string
  onDurata: (v: string) => void
  disabilitato: boolean
  inizioProposto: () => string
}) {
  const aperto = !disabilitato
  const durataMesi = numeroDa(durata)
  const fine = fineDaDurata(dal, durataMesi)
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          {dal ? (
            <Campo etichetta="Inizio" tipo="date" valore={dal} onChange={onDal} disabilitato={!aperto} />
          ) : (
            <div>
              <span className={labelCls}>Inizio</span>
              <p className="py-2 font-semibold text-gray-800">DA DEFINIRE</p>
            </div>
          )}
          {aperto && (
            <label className="mt-1.5 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!dal} onChange={(e) => onDal(e.target.checked ? '' : inizioProposto())} />
              Non si sa ancora quando inizia
            </label>
          )}
        </div>
        <div>
          <label className="block">
            <span className={labelCls}>
              Durata in mesi<span className="text-red-500 ml-0.5">*</span>
            </span>
            <input
              className={`${inputCls} ${!aperto ? 'bg-gray-50 text-gray-500' : ''}`}
              inputMode="decimal"
              value={durata}
              disabled={!aperto}
              onChange={(e) => onDurata(e.target.value)}
            />
          </label>
          {aperto && (
            <div className="flex flex-wrap gap-2 mt-1.5">
              {[3, 6, 12].map((m) => (
                <button
                  key={m}
                  onClick={() => onDurata(String(m))}
                  className={`px-3 py-1.5 rounded-full border text-sm ${durataMesi === m ? 'border-brand-cyan-dark bg-brand-cyan/10 text-brand-cyan-dark' : 'border-gray-300 bg-white text-gray-700'}`}
                >
                  {m} mesi
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-600">
        {fine
          ? `Dal ${dataIt(dal)} al ${dataIt(fine)}.`
          : durataMesi > 0
            ? 'Il periodo parte dalla data di avvio, quando si saprà.'
            : 'Scrivi quanti mesi dura.'}
      </p>
    </>
  )
}
