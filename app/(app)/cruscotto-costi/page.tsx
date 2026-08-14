import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { getStrutture } from '@/lib/strutture/data'
import { getCentriDiCosto } from '@/lib/centri-costo/data'
import { getCosti } from '@/lib/costi/data'
import { Header } from '@/components/ui/Header'
import { CruscottoCosti } from './CruscottoCosti'
import type { CostoAggregato, CostoRecord, VistaCosti } from '@/types/manutenzioni'

export const dynamic = 'force-dynamic'

/**
 * Le due viste leggono gli stessi movimenti e cambiano solo la chiave di
 * raggruppamento: la struttura dice *dove* si è speso, il centro di costo *chi*
 * ha speso. Sono domande diverse e servono entrambe.
 */
function aggrega(
  costi: CostoRecord[],
  vista: VistaCosti,
  anagrafica: Array<{ id: number; etichetta: string }>,
): CostoAggregato[] {
  const mappa = new Map<number, CostoAggregato>()

  // Si parte dall'anagrafica così compaiono anche le voci a zero: "questo
  // centro di costo non ha ancora speso niente" è un'informazione.
  for (const a of anagrafica) {
    mappa.set(a.id, { chiaveId: a.id, etichetta: a.etichetta, totale: 0, perCategoria: {}, movimenti: [] })
  }

  for (const c of costi) {
    const rif = vista === 'struttura' ? c.struttura : c.centroCosto
    const id = rif?.id ?? 0
    let agg = mappa.get(id)
    if (!agg) {
      agg = {
        chiaveId: id,
        etichetta:
          rif?.value ||
          (vista === 'struttura' ? 'Senza struttura' : 'Senza centro di costo'),
        totale: 0,
        perCategoria: {},
        movimenti: [],
      }
      mappa.set(id, agg)
    }
    agg.totale += c.importo
    agg.perCategoria[c.categoria] = (agg.perCategoria[c.categoria] ?? 0) + c.importo
    agg.movimenti.push(c)
  }

  // Prima chi ha speso di più, poi le voci a zero in ordine alfabetico.
  // La riga dei non attribuiti (chiaveId 0) va sempre in fondo, per quanto
  // pesi: è un elenco di cose da sistemare, non un centro di costo.
  return Array.from(mappa.values()).sort((a, b) => {
    if (!a.chiaveId !== !b.chiaveId) return a.chiaveId ? -1 : 1
    if (b.totale !== a.totale) return b.totale - a.totale
    return a.etichetta.localeCompare(b.etichetta, 'it')
  })
}

export default async function CruscottoCostiPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; vista?: string }>
}) {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/home')

  const { anno: annoParam, vista: vistaParam } = await searchParams
  const annoCorrente = new Date().getFullYear()
  const anno = annoParam ? Number(annoParam) : annoCorrente
  const vista: VistaCosti = vistaParam === 'struttura' ? 'struttura' : 'centro-di-costo'

  const [strutture, centri, tuttiCosti] = await Promise.all([
    getStrutture(),
    getCentriDiCosto(),
    getCosti(),
  ])

  // Anni disponibili (per il selettore), sempre incluso l'anno corrente
  const anniSet = new Set<number>([annoCorrente])
  for (const c of tuttiCosti) {
    const d = new Date(c.dataCosto)
    if (!isNaN(d.getTime())) anniSet.add(d.getFullYear())
  }
  const anni = Array.from(anniSet).sort((a, b) => b - a)

  // Costi dell'anno selezionato
  const costiAnno = tuttiCosti.filter((c) => {
    const d = new Date(c.dataCosto)
    return !isNaN(d.getTime()) && d.getFullYear() === anno
  })

  const anagrafica =
    vista === 'struttura'
      ? strutture.map((s) => ({ id: s.id, etichetta: s.strutturaLabel || s.title }))
      : centri.map((c) => ({ id: c.id, etichetta: c.nome }))

  const righe = aggrega(costiAnno, vista, anagrafica)

  const totaleComplessivo = righe.reduce((s, r) => s + r.totale, 0)

  // Movimenti che non hanno la dimensione della vista corrente: sono quelli da
  // sistemare, e vanno detti a voce alta invece che sepolti in una riga.
  const senzaDimensione = costiAnno.filter((c) =>
    vista === 'struttura' ? !c.struttura?.id : !c.centroCosto?.id,
  ).length

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Cruscotto Costi" backHref="/manutenzioni" backLabel="Torna a Manutenzioni" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <CruscottoCosti
          righe={righe}
          anni={anni}
          anno={anno}
          vista={vista}
          totaleComplessivo={totaleComplessivo}
          numMovimenti={costiAnno.length}
          senzaDimensione={senzaDimensione}
        />
      </main>
    </div>
  )
}
