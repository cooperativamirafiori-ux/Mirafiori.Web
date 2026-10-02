import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { AREA_ACQUISTI } from '@/lib/acquisti/data'
import { AREA_IT } from '@/types/it'
import { getInventario, inventarioConfigurato } from '@/lib/inventario/data'
import { getAssegnazioni } from '@/lib/it/assegnazioni'
import { getStrutture } from '@/lib/strutture/data'
import { InventarioBeni } from './InventarioBeni'

export const dynamic = 'force-dynamic'

export default async function InventarioPage() {
  const session = await auth()
  // L'inventario sta sotto Beni e IT. Entra anche chi gestisce gli acquisti:
  // registra in inventario quello che ha comprato, e senza la pagina non
  // potrebbe controllare cosa ha registrato.
  const permessi = session?.user?.permessi ?? []
  if (!permessi.includes(AREA_IT) && !permessi.includes(AREA_ACQUISTI)) redirect('/home')

  if (!inventarioConfigurato()) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header title="Inventario beni" backHref="/it" backLabel="Torna a Beni e IT" />
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

  // Le assegnazioni servono per lo storico nella scheda del bene: è qui che si
  // legge chi ha avuto un dispositivo, anche dopo che è stato dismesso e non
  // compare più nell'area IT. Una lettura per tutta la pagina, non una per riga.
  const [beni, strutture, assegnazioni] = await Promise.all([
    getInventario(),
    getStrutture(),
    getAssegnazioni('bene'),
  ])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Inventario beni" backHref="/it" backLabel="Torna a Beni e IT" />
      <main className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">
        <InventarioBeni
          iniziali={beni}
          strutture={strutture.map((s) => ({ id: s.id, label: s.strutturaLabel }))}
          assegnazioni={assegnazioni}
        />
      </main>
    </div>
  )
}
