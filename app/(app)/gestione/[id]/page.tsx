import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { getRichiestaById } from '@/lib/manutenzioni/data'
import { getTecnici } from '@/lib/strutture/data'
import { Header } from '@/components/ui/Header'
import { StatoBadge } from '@/components/ui/StatoBadge'
import { GestioneForm } from './GestioneForm'

export const dynamic = 'force-dynamic'

export default async function GestioneRichiestaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/home')

  const { id } = await params
  const [richiesta, tecnici] = await Promise.all([
    getRichiestaById(id),
    getTecnici(),
  ])

  return (
    <div className="min-h-screen flex flex-col">
      <Header title="Gestione richiesta" backHref="/dashboard" backLabel="Torna al Pannello di controllo" />

      <main className="flex-1 px-4 py-6 max-w-xl mx-auto w-full space-y-5">
        {/* Riepilogo richiesta */}
        <div className="bg-white rounded-2xl shadow p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-primary-dark">
              {richiesta.idRichiesta}
            </span>
            <StatoBadge stato={richiesta.stato} />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="text-gray-500">Struttura</div>
            <div className="text-gray-800 font-medium">{richiesta.struttura.value}</div>

            <div className="text-gray-500">Richiedente</div>
            <div className="text-gray-800">{richiesta.richiedente.displayName}</div>

            <div className="text-gray-500">Data</div>
            <div className="text-gray-800">
              {richiesta.dataRichiesta
                ? new Date(richiesta.dataRichiesta).toLocaleDateString('it-IT')
                : '—'}
            </div>

            <div className="text-gray-500">Tipo</div>
            <div className="text-gray-800">{richiesta.tipoIntervento}</div>

            <div className="text-gray-500">Priorità</div>
            <div className="text-gray-800">{richiesta.priorita}</div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Descrizione</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
              {richiesta.descrizione}
            </p>
          </div>

          <div className="h-0.5 bg-accent-yellow rounded-full" />
        </div>

        {/* Form gestione */}
        <GestioneForm richiesta={richiesta} tecnici={tecnici} />
      </main>
    </div>
  )
}
