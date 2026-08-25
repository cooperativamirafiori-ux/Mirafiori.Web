import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { getTutteAutorizzazioni, AREE_PERMESSI, DESCRIZIONI_AREE } from '@/lib/core/permessi'
import { getRubrica } from '@/lib/core/rubrica'
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

  // La rubrica serve per due cose: l'autocompletamento e i nomi accanto alle
  // email. Non lancia mai: se manca, la pagina resta usabile scrivendo l'email.
  const rubrica = await getRubrica()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Permessi Accessi" backHref="/amministrazione" backLabel="Torna all&apos;Amministrazione" />

      <main className="flex-1 px-4 py-6 max-w-5xl mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Gestione accessi</h2>
        <p className="text-gray-500 mb-6">
          Scegli una persona per vedere e cambiare le sue aree, oppure passa a
          &laquo;Per area&raquo; per vedere chi entra dove. Le modifiche sono immediate.
        </p>

        {erroreLettura ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
            Impossibile leggere la lista permessi: {erroreLettura}
            <br />
            Verifica che la variabile <code>SP_LIST_AUTORIZZAZIONI</code> sia configurata.
          </div>
        ) : (
          <GestionePermessi
            aree={[...AREE_PERMESSI]}
            descrizioni={DESCRIZIONI_AREE}
            iniziali={iniziali}
            rubrica={rubrica}
          />
        )}
      </main>
    </div>
  )
}
