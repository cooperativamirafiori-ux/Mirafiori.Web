import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { accessoStrutture, getCruscottoStrutture, puoVedereCostiStrutture } from '@/lib/costi-strutture/data'
import { AREA_AMMINISTRAZIONE } from '@/types/utenze'
import { CruscottoStrutture } from './_componenti/CruscottoStrutture'

export const dynamic = 'force-dynamic'

/**
 * Cruscotto unico dei costi per struttura: utenze, manutenzioni, pulizie,
 * lavori Cura Ambienti, acquisti, costi fissi, telefonia e il totale.
 * Chi ha "Amministrazione" (o è admin delle manutenzioni) vede tutte le
 * strutture; un coordinatore solo quelle del suo centro di costo.
 */
export default async function CostiStrutturePage({ searchParams }: { searchParams: Promise<{ anno?: string }> }) {
  const session = await auth()
  const accesso = await accessoStrutture(session?.user)
  if (!puoVedereCostiStrutture(accesso)) redirect('/home')

  const annoCorrente = new Date().getFullYear()
  const { anno: a } = await searchParams
  const anno = Number(a) >= 2024 && Number(a) <= annoCorrente ? Number(a) : annoCorrente
  const dati = await getCruscottoStrutture(anno, accesso)
  const daAmministrazione = !!session?.user?.permessi?.includes(AREA_AMMINISTRAZIONE)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        title="Costi per struttura"
        backHref={daAmministrazione ? '/amministrazione' : '/controllo-gestione'}
        backLabel={daAmministrazione ? "Torna all'Amministrazione" : 'Torna a Controllo di Gestione'}
      />
      <main className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">
        <CruscottoStrutture
          dati={dati}
          anni={Array.from({ length: annoCorrente - 2025 }, (_, i) => annoCorrente - i)}
          tutte={accesso.tutte}
          amministrazione={daAmministrazione}
        />
      </main>
    </div>
  )
}
