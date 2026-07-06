import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getStrutture, getCosti } from '@/lib/sharepoint'
import { Header } from '@/components/ui/Header'
import { CruscottoCosti } from './CruscottoCosti'
import type { CostoPerStruttura } from '@/types/manutenzioni'

export const dynamic = 'force-dynamic'

export default async function CruscottoCostiPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string }>
}) {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/home')

  const { anno: annoParam } = await searchParams
  const annoCorrente = new Date().getFullYear()
  const anno = annoParam ? Number(annoParam) : annoCorrente

  const [strutture, tuttiCosti] = await Promise.all([
    getStrutture(),
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

  // Aggregazione per struttura
  const mappa = new Map<number, CostoPerStruttura>()
  for (const s of strutture) {
    mappa.set(s.id, {
      strutturaId: s.id,
      strutturaLabel: s.strutturaLabel || s.title,
      totale: 0,
      perCategoria: {},
      movimenti: [],
    })
  }
  for (const c of costiAnno) {
    let agg = mappa.get(c.struttura.id)
    if (!agg) {
      // Costo su struttura non presente in anagrafica (fallback)
      agg = {
        strutturaId: c.struttura.id,
        strutturaLabel: c.struttura.value || 'Struttura sconosciuta',
        totale: 0,
        perCategoria: {},
        movimenti: [],
      }
      mappa.set(c.struttura.id, agg)
    }
    agg.totale += c.importo
    agg.perCategoria[c.categoria] = (agg.perCategoria[c.categoria] ?? 0) + c.importo
    agg.movimenti.push(c)
  }

  // Ordina: prima chi ha costi (decrescente), poi le strutture a zero per label
  const righe = Array.from(mappa.values()).sort((a, b) => {
    if (b.totale !== a.totale) return b.totale - a.totale
    return a.strutturaLabel.localeCompare(b.strutturaLabel, 'it')
  })

  const totaleComplessivo = righe.reduce((s, r) => s + r.totale, 0)
  const numMovimenti = costiAnno.length

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Cruscotto Costi" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <CruscottoCosti
          righe={righe}
          anni={anni}
          anno={anno}
          totaleComplessivo={totaleComplessivo}
          numMovimenti={numMovimenti}
        />
      </main>
    </div>
  )
}
