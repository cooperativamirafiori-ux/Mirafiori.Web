import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/ui/Header'
import { getTutteAutorizzazioni, AREE_PERMESSI } from '@/lib/sharepoint'
import { GestionePermessi } from './GestionePermessi'

export const dynamic = 'force-dynamic'

export default async function PermessiAccessiPage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes('Amministrazione')) redirect('/home')

  let iniziali: { id: string; utente: string; area: string }[] = []
  let erroreLettura: string | null = null
  try {
    iniziali = await getTutteAutorizzazioni()
  } catch (e) {
    erroreLettura = e instanceof Error ? e.message : 'Errore lettura permessi'
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Permessi Accessi" />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <Link
          href="/amministrazione"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Amministrazione
        </Link>

        <h2 className="text-xl font-bold text-gray-800 mb-1">Gestione accessi</h2>
        <p className="text-gray-500 mb-6">
          Attiva o disattiva l&apos;accesso di ogni persona alle aree dell&apos;app.
          Le modifiche sono immediate.
        </p>

        {erroreLettura ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
            Impossibile leggere la lista permessi: {erroreLettura}
            <br />
            Verifica che la variabile <code>SP_LIST_AUTORIZZAZIONI</code> sia configurata.
          </div>
        ) : (
          <GestionePermessi aree={[...AREE_PERMESSI]} iniziali={iniziali} />
        )}
      </main>
    </div>
  )
}
