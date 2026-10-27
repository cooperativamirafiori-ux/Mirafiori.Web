import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { getFornitori, sceltaSpecializzazione } from '@/lib/fornitori/data'
import type { Fornitore } from '@/types/fornitori'
import { GestioneFornitori } from './_componenti/GestioneFornitori'

export const dynamic = 'force-dynamic'

/**
 * Anagrafica Fornitori di Manutenzioni — solo admin (27 ott 2026).
 * Usa la lista Tecnici: chi si aggiunge qui si può subito assegnare ai ticket.
 */
export default async function FornitoriPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/manutenzioni')

  let fornitori: Fornitore[] = []
  let specializzazioni: string[] | null = null
  let errore = ''
  try {
    ;[fornitori, specializzazioni] = await Promise.all([getFornitori(), sceltaSpecializzazione()])
  } catch (e) {
    console.error('[manutenzioni/fornitori]', e)
    errore = e instanceof Error ? e.message : 'Errore di lettura'
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Fornitori" backHref="/manutenzioni" backLabel="Torna a Manutenzioni" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Anagrafica fornitori</h2>
        <p className="text-gray-500 mb-6">
          Ditte e tecnici a cui si affidano le manutenzioni. Chi è in questo elenco si può assegnare
          alle richieste dal pannello di controllo.
        </p>
        <Banner tono="errore">{errore}</Banner>
        {!errore && <GestioneFornitori fornitori={fornitori} specializzazioni={specializzazioni} />}
      </main>
    </div>
  )
}
