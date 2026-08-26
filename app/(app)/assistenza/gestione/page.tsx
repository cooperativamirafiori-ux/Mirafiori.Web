import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { assistenzaConfigurata, getTicket } from '@/lib/assistenza/data'
import { getUtentiPerArea } from '@/lib/core/permessi'
import { AREA_ASSISTENZA } from '@/types/assistenza'
import { GestioneAssistenza } from './GestioneAssistenza'

export const dynamic = 'force-dynamic'

/**
 * L'unica pagina protetta della sezione: chiedere assistenza è di tutti,
 * lavorarla no. Il permesso è quello dell'area IT, non uno nuovo.
 */
export default async function GestioneAssistenzaPage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA_ASSISTENZA)) redirect('/home')

  if (!assistenzaConfigurata()) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header title="Gestione assistenza" backHref="/assistenza" backLabel="Torna ad Assistenza IT" />
        <main className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4">
            La sezione non è ancora configurata: esegui{' '}
            <code className="font-mono">node scripts/provision-assistenza.mjs</code> e imposta{' '}
            <code className="font-mono">SP_LIST_ASSISTENZA</code>.
          </div>
        </main>
      </div>
    )
  }

  const [ticket, gestori] = await Promise.all([
    getTicket(),
    getUtentiPerArea(AREA_ASSISTENZA),
  ])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Gestione assistenza" backHref="/assistenza" backLabel="Torna ad Assistenza IT" />
      <main className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">
        <GestioneAssistenza
          iniziali={ticket}
          gestori={gestori}
          io={session.user.email ?? ''}
        />
      </main>
    </div>
  )
}
