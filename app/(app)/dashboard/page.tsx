import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { getRichiesteAperte } from '@/lib/manutenzioni/data'
import { getTecnici } from '@/lib/strutture/data'
import { Header } from '@/components/ui/Header'
import { RichiestaCard } from './RichiestaCard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/home')

  const [richieste, tecnici] = await Promise.all([
    getRichiesteAperte(),
    getTecnici(),
  ])

  const aperte = richieste.filter((r) => r.stato === 'Aperta').length
  const inLavorazione = richieste.filter((r) => r.stato === 'In lavorazione').length
  const urgenti = richieste.filter((r) => r.priorita.startsWith('Urgente')).length
  const daAssegnare = richieste.filter((r) => r.stato === 'Aperta' && !r.tecnico).length

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Pannello di controllo" backHref="/manutenzioni" backLabel="Torna a Manutenzioni" />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full space-y-6">

        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
            <p className="text-3xl font-bold text-red-600">{aperte}</p>
            <p className="text-xs text-gray-500 mt-1">Aperte</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
            <p className="text-3xl font-bold text-orange-500">{inLavorazione}</p>
            <p className="text-xs text-gray-500 mt-1">In lavorazione</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
            <p className="text-3xl font-bold text-red-700">{urgenti}</p>
            <p className="text-xs text-gray-500 mt-1">Urgenti</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
            <p className="text-3xl font-bold text-primary">{daAssegnare}</p>
            <p className="text-xs text-gray-500 mt-1">Da assegnare</p>
          </div>
        </div>

        {/* Lista */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">
              Richieste attive <span className="text-gray-400 font-normal">({richieste.length})</span>
            </h2>
          </div>

          {richieste.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-10 text-center text-gray-400">
              Nessuna richiesta attiva 🎉
            </div>
          ) : (
            <div className="space-y-3">
              {richieste.map((r) => (
                <RichiestaCard key={r.spItemId} richiesta={r} tecnici={tecnici} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
