/**
 * Tariffario dei preventivi. Lo vedono tutti quelli che fanno preventivi;
 * lo modifica (prezzi, voci, adeguamento ISTAT) solo chi ha "Amministrazione".
 */

import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { accessoPreventivi, puoEntrare } from '@/lib/preventivi/accesso'
import { Tariffario } from '../_componenti/Tariffario'

export const dynamic = 'force-dynamic'

export default async function TariffarioPage() {
  const session = await auth()
  const accesso = await accessoPreventivi(session?.user)
  if (!puoEntrare(accesso)) redirect('/home')
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Tariffario preventivi" backHref="/preventivi/servizi" backLabel="Torna ai Preventivi Servizi" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <Tariffario modificabile={accesso.tutti} />
      </main>
    </div>
  )
}
