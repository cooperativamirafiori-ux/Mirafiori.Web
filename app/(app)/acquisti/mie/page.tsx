import Link from 'next/link'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { acquistiConfigurato, getAcquistiByEmail } from '@/lib/acquisti/data'
import { luogoRitiro, referentiPresidio, strutturaPresidiata } from '@/lib/acquisti/flusso'
import { MieRichiesteAcquisto } from './MieRichiesteAcquisto'

export const dynamic = 'force-dynamic'

export default async function MieRichiesteAcquistoPage() {
  const session = await auth()
  const email = session?.user?.email ?? ''

  if (!acquistiConfigurato()) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header title="Le mie richieste di acquisto" backHref="/acquisti" backLabel="Torna a Richieste Acquisto" />
        <main className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4">
            La sezione non è ancora configurata.
          </div>
        </main>
      </div>
    )
  }

  const richieste = await getAcquistiByEmail(email)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-orange-light/20 via-white to-white">
      <Header title="Le mie richieste di acquisto" backHref="/acquisti" backLabel="Torna a Richieste Acquisto" />
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-600">
            {richieste.length} richiest{richieste.length === 1 ? 'a' : 'e'}
          </h2>
          <Link href="/acquisti/nuova" className="text-sm text-brand-orange font-semibold">
            + Nuova
          </Link>
        </div>

        {/* La regola della consegna presidiata sta in variabili d'ambiente, che
            il client non legge: gliela passo come dati. */}
        <MieRichiesteAcquisto
          iniziali={richieste}
          strutturaPresidiata={strutturaPresidiata()}
          luogoRitiro={luogoRitiro()}
          sonoReferente={referentiPresidio().includes(email.toLowerCase())}
        />
      </main>
    </div>
  )
}
