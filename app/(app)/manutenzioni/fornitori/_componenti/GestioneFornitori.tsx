'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banner } from '@/components/ui/Banner'
import { Pill } from '@/components/ui/Pill'
import { Vuoto } from '@/components/ui/Vuoto'
import { inputCls } from '@/components/ui/Campo'
import { testoRicerca, type Fornitore } from '@/types/fornitori'
import { ModaleFornitore } from './ModaleFornitore'

/** Elenco a schede (niente tabella: si usa anche da telefono), ricerca e modale. */
export function GestioneFornitori({
  fornitori,
  specializzazioni,
}: {
  fornitori: Fornitore[]
  specializzazioni: string[] | null
}) {
  const router = useRouter()
  const [modifica, setModifica] = useState<Fornitore | 'nuovo' | null>(null)
  const [messaggio, setMessaggio] = useState('')
  const [cerca, setCerca] = useState('')

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    return q ? fornitori.filter((f) => testoRicerca(f).includes(q)) : fornitori
  }, [fornitori, cerca])

  // Se la colonna è testo libero, si propongono i valori già usati.
  const sceltePossibili = useMemo(
    () =>
      specializzazioni ??
      [...new Set(fornitori.map((f) => f.specializzazione).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it')),
    [fornitori, specializzazioni],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca per nome, ditta, P.IVA…"
          className={`${inputCls} flex-1 min-w-[12rem] text-base sm:text-sm`}
        />
        <button
          onClick={() => setModifica('nuovo')}
          className="px-4 py-2 rounded-xl bg-brand-cyan text-white text-sm font-semibold"
        >
          + Nuovo fornitore
        </button>
      </div>
      <p className="text-sm text-gray-500">
        {visibili.length === fornitori.length
          ? `${fornitori.length} fornitori`
          : `${visibili.length} di ${fornitori.length} fornitori`}
      </p>
      <Banner tono="ok">{messaggio}</Banner>
      {!visibili.length && <Vuoto>{cerca ? 'Nessun fornitore corrisponde alla ricerca.' : 'Nessun fornitore in anagrafica.'}</Vuoto>}

      <div className="space-y-2">
        {visibili.map((f) => (
          <button
            key={f.id}
            onClick={() => setModifica(f)}
            className="w-full text-left bg-white rounded-xl border border-gray-100 p-3.5 hover:border-brand-cyan transition-colors"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-gray-800">{f.nome}</span>
              {f.ditta && f.ditta !== f.nome && <span className="text-sm text-gray-500">{f.ditta}</span>}
              {f.specializzazione && <Pill tono="neutro" text={f.specializzazione} />}
            </div>
            <p className="text-xs text-gray-500 mt-1 break-words">
              {[
                f.telefono && `📞 ${f.telefono}`,
                f.email && `✉️ ${f.email}`,
                f.partitaIva && `P.IVA ${f.partitaIva}`,
              ]
                .filter(Boolean)
                .join(' · ') || 'Nessun recapito'}
            </p>
          </button>
        ))}
      </div>

      {modifica && (
        <ModaleFornitore
          fornitore={modifica === 'nuovo' ? null : modifica}
          specializzazioni={sceltePossibili}
          specializzazioneLibera={!specializzazioni}
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
