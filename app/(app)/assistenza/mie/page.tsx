import Link from 'next/link'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { assistenzaConfigurata, getTicketByEmail } from '@/lib/assistenza/data'
import { MieRichiesteAssistenza } from './MieRichiesteAssistenza'

export const dynamic = 'force-dynamic'

export default async function MieRichiesteAssistenzaPage() {
  const session = await auth()
  const email = session?.user?.email ?? ''

  if (!assistenzaConfigurata()) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header
          title="Le mie richieste di assistenza"
          backHref="/assistenza"
          backLabel="Torna ad Assistenza IT"
        />
        <main className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4">
            La sezione non è ancora configurata.
          </div>
        </main>
      </div>
    )
  }

  const richieste = await getTicketByEmail(email)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-cyan/10 via-white to-white">
      <Header
        title="Le mie richieste di assistenza"
        backHref="/assistenza"
        backLabel="Torna ad Assistenza IT"
      />
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-600">
            {richieste.length} richiest{richieste.length === 1 ? 'a' : 'e'}
          </h2>
          <Link href="/assistenza/nuova" className="text-sm text-brand-cyan font-semibold">
            + Nuova
          </Link>
        </div>

        <MieRichiesteAssistenza iniziali={richieste} />
      </main>
    </div>
  )
}
