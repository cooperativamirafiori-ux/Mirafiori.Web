import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { acquistiConfigurato, getAcquisti, getFornitoriNoti, AREA_ACQUISTI } from '@/lib/acquisti/data'
import { getInventario, inventarioConfigurato } from '@/lib/inventario/data'
import { getStrutture } from '@/lib/strutture/data'
import { getUtentiPerArea } from '@/lib/core/permessi'
import { GestioneAcquisti } from './GestioneAcquisti'

export const dynamic = 'force-dynamic'

export default async function GestioneAcquistiPage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA_ACQUISTI)) redirect('/home')

  if (!acquistiConfigurato()) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header title="Gestione acquisti" />
        <main className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4">
            La sezione non è ancora configurata: esegui{' '}
            <code className="font-mono">node scripts/provision-acquisti.mjs</code> e imposta{' '}
            <code className="font-mono">SP_LIST_ACQUISTI</code>.
          </div>
        </main>
      </div>
    )
  }

  const inventarioAttivo = inventarioConfigurato()

  const [acquisti, strutture, fornitori, gestori, beni] = await Promise.all([
    getAcquisti(),
    getStrutture(),
    getFornitoriNoti(),
    getUtentiPerArea(AREA_ACQUISTI),
    // Un inventario non configurato non deve far fallire la pagina: la sezione
    // acquisti funzionava già prima che esistesse.
    inventarioAttivo ? getInventario().catch(() => []) : Promise.resolve([]),
  ])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Gestione acquisti" />
      <main className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">
        <div className="flex justify-end mb-3">
          <Link href="/acquisti" className="text-sm text-gray-500">
            ← Indietro
          </Link>
        </div>
        <GestioneAcquisti
          iniziali={acquisti}
          strutture={strutture.map((s) => ({ id: s.id, label: s.strutturaLabel }))}
          fornitori={fornitori}
          gestori={gestori}
          beni={beni}
          inventarioAttivo={inventarioAttivo}
        />
      </main>
    </div>
  )
}
