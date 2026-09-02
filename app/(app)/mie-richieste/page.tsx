import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { puoRichiedereManutenzione } from '@/lib/core/permessi'
import { getRichiesteByEmail } from '@/lib/manutenzioni/data'
import { Header } from '@/components/ui/Header'
import { StatoBadge } from '@/components/ui/StatoBadge'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function MieRichiestePage() {
  const session = await auth()
  if (!puoRichiedereManutenzione(session?.user)) redirect('/home')
  const email = session?.user?.email ?? ''

  const richieste = await getRichiesteByEmail(email)

  return (
    <div className="min-h-screen flex flex-col">
      <Header title="Le mie richieste" backHref="/manutenzioni" backLabel="Torna a Manutenzioni" />

      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        <h2 className="text-base font-semibold text-gray-700 mb-4">
          {richieste.length} richieste trovate
        </h2>

        {richieste.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-400">
            Nessuna richiesta trovata.{' '}
            <Link href="/nuova-richiesta" className="text-primary underline">
              Inserisci la prima
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {richieste.map((r) => (
              <div
                key={r.spItemId}
                className="bg-white rounded-xl shadow px-5 py-4 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-semibold text-primary-dark">{r.idRichiesta}</span>
                    <span className="text-gray-400 text-xs ml-2">
                      {r.dataRichiesta
                        ? new Date(r.dataRichiesta).toLocaleDateString('it-IT')
                        : '—'}
                    </span>
                  </div>
                  <StatoBadge stato={r.stato} />
                </div>

                <p className="text-sm text-gray-600 font-medium">{r.struttura.value}</p>
                <p className="text-sm text-gray-500">
                  {r.tipoIntervento} · {r.priorita}
                </p>
                <p className="text-sm text-gray-500 line-clamp-2">{r.descrizione}</p>

                {r.tecnico && (
                  <p className="text-xs text-gray-400">
                    Tecnico assegnato: {r.tecnico.value}
                    {r.tecnicoTelefono ? ` · 📞 ${r.tecnicoTelefono}` : ''}
                  </p>
                )}

                {/* Separatore giallo — riprende il design Power Apps */}
                <div className="h-0.5 bg-accent-yellow rounded-full mt-1" />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
