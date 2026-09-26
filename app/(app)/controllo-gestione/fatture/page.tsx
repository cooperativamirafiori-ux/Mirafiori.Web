/**
 * Fatture da segnare — il coordinatore prende le fatture del suo servizio.
 *
 * Entrano i coordinatori di un centro di costo e chi ha il permesso
 * "Controllo di Gestione" o "Pagamenti". Regole in lib/pagamenti/assegnazione.ts.
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { accessoAssegnazione, puoAssegnare } from '@/lib/pagamenti/assegnazione'
import { FattureCentro } from './FattureCentro'

export const dynamic = 'force-dynamic'

export default async function FattureCentroPage() {
  const session = await auth()
  if (!puoAssegnare(await accessoAssegnazione(session?.user))) redirect('/home')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Fatture del servizio" backHref="/controllo-gestione" backLabel="Torna al Controllo di Gestione" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <FattureCentro email={session?.user?.email ?? ''} />
      </main>
    </div>
  )
}
