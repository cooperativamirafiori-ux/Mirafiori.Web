/**
 * Fatture da segnare — il coordinatore prende le fatture del suo servizio.
 *
 * Si entra come nella scheda Qonto: coordinatori di un centro di costo, o
 * permesso "Controllo di Gestione". Regole in lib/pagamenti/assegnazione.ts.
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { accessoQonto, puoVedereQonto } from '@/lib/qonto/accesso'
import { FattureCentro } from './FattureCentro'

export const dynamic = 'force-dynamic'

export default async function FattureCentroPage() {
  const session = await auth()
  if (!puoVedereQonto(await accessoQonto(session?.user))) redirect('/home')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Fatture del servizio" backHref="/controllo-gestione" backLabel="Torna al Controllo di Gestione" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <FattureCentro email={session?.user?.email ?? ''} />
      </main>
    </div>
  )
}
