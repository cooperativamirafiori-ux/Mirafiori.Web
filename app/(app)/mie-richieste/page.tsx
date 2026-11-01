import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { puoRichiedereManutenzione } from '@/lib/core/permessi'
import { getRichiesteByEmail } from '@/lib/manutenzioni/data'
import { nonLettiPerRichiesta } from '@/lib/manutenzioni/pratica'
import { Header } from '@/components/ui/Header'
import Link from 'next/link'
import { RichiestaRichiedente } from './RichiestaRichiedente'

export const dynamic = 'force-dynamic'

export default async function MieRichiestePage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>
}) {
  const session = await auth()
  if (!puoRichiedereManutenzione(session?.user)) redirect('/home')
  const email = session?.user?.email ?? ''
  // ?r=<id> arriva dal link della mail: apre quella richiesta.
  const { r: daAprire } = await searchParams

  const [richieste, nonLetti] = await Promise.all([
    getRichiesteByEmail(email),
    // I messaggi sono un di più: se non si leggono, l'elenco c'è lo stesso.
    nonLettiPerRichiesta('gestione').catch((e) => {
      console.error('[mie-richieste] messaggi non letti:', e)
      return {} as Record<string, number>
    }),
  ])

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
              <RichiestaRichiedente
                key={r.spItemId}
                richiesta={r}
                nonLetti={nonLetti[r.spItemId] ?? 0}
                apertaAllInizio={daAprire === r.spItemId}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
