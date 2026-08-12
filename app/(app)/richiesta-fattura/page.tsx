import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { fattureConfigurato } from '@/lib/fatture/data'
import { getCentriDiCosto } from '@/lib/fatture/centri-di-costo'
import { RichiestaFatturaForm } from './RichiestaFatturaForm'

export const dynamic = 'force-dynamic'

export default async function RichiestaFatturaPage() {
  const session = await auth()
  // Nessun permesso d'area: la sezione è aperta a tutta la cooperativa.
  if (!session?.user?.email) redirect('/login')

  const centri = fattureConfigurato() ? await getCentriDiCosto() : []

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Richiesta Fattura" backHref="/home" backLabel="Torna alla Home" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        {!fattureConfigurato() ? (
          <Banner tono="avviso">
            La sezione non è ancora configurata: esegui{' '}
            <code className="font-mono">node scripts/provision-fatture.mjs</code> e imposta{' '}
            <code className="font-mono">SP_LIST_FATTURE</code>.
          </Banner>
        ) : (
          <RichiestaFatturaForm
            centriDiCosto={centri}
            richiedente={session.user.email}
            richiedenteNome={session.user.name ?? ''}
          />
        )}
      </main>
    </div>
  )
}
