/**
 * Cura Ambienti — i lavori del coordinatore: preventivi e consuntivi per
 * struttura o cliente esterno. Piano: docs/cura-ambienti-piano.md
 *
 * Entrano i coordinatori di cc24 e chi ha "Controllo di Gestione".
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { puoUsareCuraAmbienti } from '@/lib/cura-ambienti/accesso'
import { LavoriCuraAmbienti } from './_componenti/LavoriCuraAmbienti'

export const dynamic = 'force-dynamic'

export default async function CuraAmbientiPage() {
  const session = await auth()
  if (!(await puoUsareCuraAmbienti(session?.user))) redirect('/home')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Cura Ambienti" backHref="/controllo-gestione" backLabel="Torna al Controllo di Gestione" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <LavoriCuraAmbienti />
      </main>
    </div>
  )
}
