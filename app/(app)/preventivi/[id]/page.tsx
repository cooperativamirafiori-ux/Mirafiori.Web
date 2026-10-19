/**
 * Un preventivo: `/preventivi/nuovo` per crearlo, `/preventivi/<id>` per
 * aprirlo. È una pagina intera e non un pannello: il modulo è lungo e si
 * compila dal telefono.
 */

import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { accessoPreventivi, puoEntrare } from '@/lib/preventivi/accesso'
import { EditorPreventivo } from '../_componenti/EditorPreventivo'

export const dynamic = 'force-dynamic'

export default async function PreventivoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ prezzi?: string }>
}) {
  const session = await auth()
  const accesso = await accessoPreventivi(session?.user)
  if (!puoEntrare(accesso)) redirect('/home')
  const { id } = await params
  const { prezzi } = await searchParams
  if (id !== 'nuovo' && !/^\d+$/.test(id)) redirect('/preventivi')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title={id === 'nuovo' ? 'Nuovo preventivo' : 'Preventivo'} backHref="/preventivi" backLabel="Torna ai Preventivi" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <EditorPreventivo id={id === 'nuovo' ? null : id} prezziAggiornati={Number(prezzi) || 0} />
      </main>
    </div>
  )
}
