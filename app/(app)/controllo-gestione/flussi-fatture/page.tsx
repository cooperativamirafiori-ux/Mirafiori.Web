import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { puoVedereFlussiFatture } from '@/lib/core/permessi'
import { AREA_PAGAMENTI, AREA_APPROVAZIONE_PAGAMENTI } from '@/types/pagamenti'
import { FlussiFatture } from './FlussiFatture'

export const dynamic = 'force-dynamic'

export default async function FlussiFatturePage() {
  const session = await auth()
  const permessi = session?.user?.permessi
  if (!puoVedereFlussiFatture(permessi)) redirect('/home')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        title="Flussi fatture"
        backHref="/controllo-gestione"
        backLabel="Torna al Controllo di Gestione"
      />
      <main className="flex-1 px-4 py-6 max-w-5xl mx-auto w-full">
        <FlussiFatture
          puoPagare={permessi?.includes(AREA_PAGAMENTI) ?? false}
          puoApprovare={permessi?.includes(AREA_APPROVAZIONE_PAGAMENTI) ?? false}
        />
      </main>
    </div>
  )
}
