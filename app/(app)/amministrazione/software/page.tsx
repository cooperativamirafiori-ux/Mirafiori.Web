import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/ui/Header'
import { getSoftware } from '@/lib/software'
import type { Software } from '@/types/software'
import { GestioneSoftware } from './GestioneSoftware'

export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'

export default async function GestioneSoftwarePage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA)) redirect('/home')

  let software: Software[] = []
  let erroreLista = false
  try {
    software = await getSoftware()
  } catch (err) {
    // Lista SharePoint non ancora configurata → empty state senza crashare
    console.error('[amministrazione/software]', err)
    erroreLista = true
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Gestione Software" />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <Link
          href="/amministrazione"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Torna all&apos;Amministrazione
        </Link>

        <h2 className="text-xl font-bold text-gray-800 mb-1">Software e abbonamenti</h2>
        <p className="text-gray-500 mb-6">
          Tutti i servizi della cooperativa in un posto solo: credenziali, scadenze,
          carta di pagamento e fattura. Avviso automatico via email 20 giorni prima
          di ogni scadenza.
        </p>

        {erroreLista && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-6">
            La lista SharePoint non è ancora configurata. Esegui{' '}
            <code className="font-mono">node scripts/provision-software.mjs</code> e imposta{' '}
            <code className="font-mono">SP_LIST_SOFTWARE</code>.
          </div>
        )}

        <GestioneSoftware iniziali={software} />
      </main>
    </div>
  )
}
