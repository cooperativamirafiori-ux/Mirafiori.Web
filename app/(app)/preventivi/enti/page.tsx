/**
 * Enti dei preventivi (20/11/2026, chiesto da Andrea e Dennis): l'elenco degli
 * enti con il nome usato in fattura. Chi fa preventivi lo vede, aggiunge un
 * ente nuovo e corregge un nome; nascondere un ente è di chi gestisce il
 * tariffario. Regole: lib/preventivi/enti.ts
 */

import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { accessoPreventivi, puoEntrare } from '@/lib/preventivi/accesso'
import { ElencoEnti } from '../_componenti/ElencoEnti'

export const dynamic = 'force-dynamic'

export default async function EntiPage() {
  const session = await auth()
  const accesso = await accessoPreventivi(session?.user)
  if (!puoEntrare(accesso)) redirect('/home')
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Enti dei preventivi" backHref="/preventivi/servizi" backLabel="Torna ai Preventivi Servizi" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <ElencoEnti tutti={accesso.tutti} />
      </main>
    </div>
  )
}
