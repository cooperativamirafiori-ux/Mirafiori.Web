/**
 * Costi generali: percentuali con cui i costi di cc23 si dividono fra i servizi.
 * Piano: docs/servizi-interni-piano.md. Solo chi ha "Controllo di Gestione".
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { accessoServiziInterni, puoRipartire } from '@/lib/servizi-interni/accesso'
import { Percentuali } from './_componenti/Percentuali'

export const dynamic = 'force-dynamic'

export default async function CostiGeneraliPage() {
  const session = await auth()
  if (!puoRipartire(await accessoServiziInterni(session?.user))) redirect('/controllo-gestione')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Costi generali" backHref="/controllo-gestione" backLabel="Torna al Controllo di Gestione" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <Percentuali />
      </main>
    </div>
  )
}
