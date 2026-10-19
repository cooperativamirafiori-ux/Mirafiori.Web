'use client'

/** Il riquadro dei totali, con gli stessi conti del documento (lib/preventivi/calcoli.ts). */

import type { TotaliPreventivo } from '@/types/preventivi'
import { euro, numero } from '@/lib/preventivi/calcoli'

export function Totali({ t }: { t: TotaliPreventivo }) {
  const riga = (etichetta: string, valore: number, forte = false) => (
    <div className={`flex justify-between gap-3 ${forte ? 'font-bold text-gray-900 border-t border-gray-200 pt-1.5' : 'text-gray-700'}`}>
      <span>{etichetta}</span>
      <span className="tabular-nums whitespace-nowrap">{euro(valore)}</span>
    </div>
  )
  return (
    <section className="rounded-2xl border border-brand-cyan/40 bg-white p-4 space-y-1.5 text-sm">
      <h3 className="font-bold text-gray-800 mb-1">Totali</h3>
      {t.perGruppo.map((g) => (
        <div key={g.gruppo} className="flex justify-between gap-3 text-gray-500">
          <span>{g.gruppo}</span>
          <span className="tabular-nums">{euro(g.importo)}</span>
        </div>
      ))}
      <div className="pt-1.5" />
      {riga('Totale spese', t.spese)}
      {t.iva > 0 && riga('IVA', t.iva)}
      {t.fic > 0 && riga('Spese F.I.C. (escluse art. 15)', t.fic)}
      {riga('Costo totale mensile (IVA compresa)', t.mensileIvato, true)}
      {riga('Totale a pagare senza IVA', t.mensileSenzaIva)}
      {t.mesi > 0 && riga(`Sul periodo: ${numero(t.mesi)} mesi, IVA compresa`, t.periodo, true)}
    </section>
  )
}
