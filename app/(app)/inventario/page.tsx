import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { AREA_ACQUISTI } from '@/lib/acquisti'
import { getInventario, inventarioConfigurato } from '@/lib/inventario'
import { getStrutture } from '@/lib/sharepoint'
import { InventarioBeni } from './InventarioBeni'

export const dynamic = 'force-dynamic'

export default async function InventarioPage() {
  const session = await auth()
  // Stesso permesso degli acquisti: chi gestisce gli ordini tiene l'inventario.
  if (!session?.user?.permessi?.includes(AREA_ACQUISTI)) redirect('/home')

  if (!inventarioConfigurato()) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header title="Inventario beni" />
        <main className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4">
            L’inventario non è ancora configurato: esegui{' '}
            <code className="font-mono">node scripts/provision-inventario.mjs</code> e imposta{' '}
            <code className="font-mono">SP_LIST_INVENTARIO</code>.
          </div>
        </main>
      </div>
    )
  }

  const [beni, strutture] = await Promise.all([getInventario(), getStrutture()])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Inventario beni" />
      <main className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">
        <div className="flex justify-end mb-3">
          <Link href="/acquisti" className="text-sm text-gray-500">
            ← Acquisti
          </Link>
        </div>
        <InventarioBeni
          iniziali={beni}
          strutture={strutture.map((s) => ({ id: s.id, label: s.strutturaLabel }))}
        />
      </main>
    </div>
  )
}
