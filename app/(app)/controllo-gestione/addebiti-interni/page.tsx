/**
 * Addebiti interni: un servizio addebita a un altro il lavoro fatto per lui.
 * Piano: docs/servizi-interni-piano.md.
 *
 * Entrano i coordinatori dei centri di costo (senza permesso da assegnare) e
 * chi ha "Controllo di Gestione".
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { accessoServiziInterni, puoUsareServiziInterni } from '@/lib/servizi-interni/accesso'
import { AddebitiInterni } from './_componenti/AddebitiInterni'

export const dynamic = 'force-dynamic'

export default async function AddebitiInterniPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const session = await auth()
  if (!puoUsareServiziInterni(await accessoServiziInterni(session?.user))) redirect('/home')
  // ?r=<id> arriva dalle mail: evidenzia quell'addebito.
  const { r } = await searchParams

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Addebiti interni" backHref="/controllo-gestione" backLabel="Torna al Controllo di Gestione" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <AddebitiInterni apri={r} />
      </main>
    </div>
  )
}
