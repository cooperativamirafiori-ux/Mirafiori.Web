/**
 * Preventivi Catering — il calcolatore (ricostruisce "Budget Preventivo.xlsx").
 * Conti in lib/preventivi/catering-calcoli.ts, parametri in lib/preventivi/catering.ts.
 *
 * Entra chi entra nei Preventivi; i parametri li cambia solo chi ha
 * Amministrazione (gli altri li vedono).
 */

import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { accessoPreventivi, puoEntrare } from '@/lib/preventivi/accesso'
import { leggiParametriCateringSP } from '@/lib/preventivi/catering'
import { CalcolatoreCatering } from './_componenti/CalcolatoreCatering'

export const dynamic = 'force-dynamic'

export default async function PreventiviCateringPage() {
  const session = await auth()
  const accesso = await accessoPreventivi(session?.user)
  if (!puoEntrare(accesso)) redirect('/home')
  const lettura = await leggiParametriCateringSP()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Preventivi Catering" backHref="/preventivi" backLabel="Torna ai Preventivi" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <CalcolatoreCatering parametriIniziali={lettura.parametri} avviso={lettura.avviso} modificabile={accesso.tutti} />
      </main>
    </div>
  )
}
