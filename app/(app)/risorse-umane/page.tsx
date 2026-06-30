import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const AREA = 'Risorse Umane'

export default async function RisorseUmanePage() {
  const session = await auth()
  // Guard: l'area è nascosta a chi non è autorizzato
  if (!session?.user?.permessi?.includes(AREA)) redirect('/home')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Risorse Umane" />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <Link
          href="/home"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Torna alla home
        </Link>

        <h2 className="text-xl font-bold text-gray-800 mb-1">Area riservata</h2>
        <p className="text-gray-500 mb-6">
          Strumenti per la gestione del personale. Le sotto-sezioni verranno aggiunte qui.
        </p>

        {/* Sotto-attività dell'area Risorse Umane (da popolare) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-400 sm:col-span-2">
            Nessuna sotto-sezione ancora disponibile.
          </div>
        </section>
      </main>
    </div>
  )
}
