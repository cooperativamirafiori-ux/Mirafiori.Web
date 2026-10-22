/**
 * Preventivi Servizi — elenco (i preventivi agli enti).
 * Fino al 22/10/2026 stava su /preventivi, che ora è l'hub con anche il Catering. Piano: docs/preventivi.md
 *
 * Entrano i coordinatori dei centri di costo (vedono i loro) e chi ha
 * "Amministrazione" (vede tutto). Regole in lib/preventivi/accesso.ts.
 */

import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { accessoPreventivi, puoEntrare } from '@/lib/preventivi/accesso'
import { preventiviConfigurati } from '@/lib/preventivi/data'
import { ElencoPreventivi } from '../_componenti/ElencoPreventivi'

export const dynamic = 'force-dynamic'

export default async function PreventiviServiziPage({ searchParams }: { searchParams: Promise<{ stato?: string }> }) {
  const session = await auth()
  const accesso = await accessoPreventivi(session?.user)
  if (!puoEntrare(accesso)) redirect('/home')
  const { stato } = await searchParams

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Preventivi Servizi" backHref="/preventivi" backLabel="Torna ai Preventivi" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        {preventiviConfigurati() ? (
          <ElencoPreventivi statoIniziale={stato ?? ''} tutti={accesso.tutti} />
        ) : (
          <Banner tono="avviso">
            La sezione non è ancora configurata: manca il collegamento alle liste SharePoint (scripts/provision-preventivi.mjs).
          </Banner>
        )}
      </main>
    </div>
  )
}
