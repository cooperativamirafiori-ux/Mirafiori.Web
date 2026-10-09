'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banner } from '@/components/ui/Banner'
import { Pill } from '@/components/ui/Pill'
import { Vuoto } from '@/components/ui/Vuoto'
import { annuo, inVigore, type CostoFisso } from '@/types/costi-fissi'
import type { StrutturaCc } from '@/types/utenze'
import { data, euro } from '../../costi-strutture/_componenti/formato'
import { ModaleCostoFisso } from './ModaleCostoFisso'

/**
 * Elenco dei costi fissi per struttura. Una voce chiusa resta visibile sotto
 * "Storico": è la prova che il passato non è cambiato (un affitto aumentato è
 * la voce vecchia chiusa + la nuova).
 */
export function GestioneCostiFissi({ costi, strutture }: { costi: CostoFisso[]; strutture: StrutturaCc[] }) {
  const router = useRouter()
  const [modifica, setModifica] = useState<CostoFisso | 'nuovo' | null>(null)
  const [messaggio, setMessaggio] = useState('')
  const [storico, setStorico] = useState(false)
  const oggi = new Date().toISOString().slice(0, 10)

  const nome = useMemo(() => new Map(strutture.map((s) => [s.id, `${s.codice} · ${s.nome}`])), [strutture])
  const vigenti = costi.filter((c) => inVigore(c, oggi))
  const chiusi = costi.filter((c) => !inVigore(c, oggi))

  const gruppi = useMemo(() => {
    const m = new Map<string, CostoFisso[]>()
    for (const c of storico ? costi : vigenti) {
      const k = c.strutturaId ? nome.get(c.strutturaId) ?? c.strutturaNome : 'Senza struttura'
      m.set(k, [...(m.get(k) ?? []), c])
    }
    for (const righe of m.values()) {
      righe.sort((a, b) => a.descrizione.localeCompare(b.descrizione, 'it') || (b.dataPrimaScadenza ?? '').localeCompare(a.dataPrimaScadenza ?? ''))
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'it'))
  }, [costi, vigenti, nome, storico])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-gray-500 mr-auto">
          {vigenti.length} voci in vigore · {euro(vigenti.reduce((s, c) => s + annuo(c), 0))} l&apos;anno
        </p>
        {chiusi.length > 0 && (
          <button onClick={() => setStorico(!storico)} className="px-3 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700">
            {storico ? 'Nascondi lo storico' : `Mostra lo storico (${chiusi.length})`}
          </button>
        )}
        <button onClick={() => setModifica('nuovo')} className="px-4 py-2 rounded-xl bg-brand-cyan text-white text-sm font-semibold">
          + Nuovo costo fisso
        </button>
      </div>
      <Banner tono="ok">{messaggio}</Banner>
      {!gruppi.length && <Vuoto>Nessun costo fisso in vigore.</Vuoto>}

      {gruppi.map(([g, righe]) => (
        <div key={g}>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{g}</p>
            <p className="text-xs text-gray-500">{euro(righe.filter((c) => inVigore(c, oggi)).reduce((s, c) => s + annuo(c), 0))} l&apos;anno</p>
          </div>
          <div className="space-y-2">
            {righe.map((c) => {
              const vale = inVigore(c, oggi)
              return (
                <button
                  key={c.id}
                  onClick={() => setModifica(c)}
                  className={`w-full text-left bg-white rounded-xl border border-gray-100 p-3.5 hover:border-brand-cyan transition-colors ${vale ? '' : 'opacity-60'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-800">{c.descrizione}</span>
                    <Pill tono="neutro" text={c.categoria} />
                    {c.dataFine && <Pill tono={vale ? 'ambra' : 'neutro'} text={vale ? `finisce il ${data(c.dataFine)}` : 'conclusa'} />}
                    {!c.dataFine && !c.attivo && <Pill tono="rosso" text="spenta senza data di fine" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {euro(c.importo, 2)} {c.frequenza.toLowerCase()} · {euro(annuo(c))} l&apos;anno ·{' '}
                    {c.dataPrimaScadenza ? `dal ${data(c.dataPrimaScadenza)}` : 'da sempre'}
                    {c.dataFine ? ` al ${data(c.dataFine)}` : ''}
                    {c.fornitore ? ` · ${c.fornitore}` : ''}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {modifica && (
        <ModaleCostoFisso
          costo={modifica === 'nuovo' ? null : modifica}
          strutture={strutture}
          onChiudi={() => setModifica(null)}
          onFatto={(t) => {
            setModifica(null)
            setMessaggio(t)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
