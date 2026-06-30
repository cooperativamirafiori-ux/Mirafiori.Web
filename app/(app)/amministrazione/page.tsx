import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'

export default async function AmministrazionePage() {
  const session = await auth()
  // Guard: solo chi ha il permesso "Amministrazione" può entrare
  if (!session?.user?.permessi?.includes(AREA)) redirect('/home')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Amministrazione" />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <Link
          href="/home"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Torna alla home
        </Link>

        <h2 className="text-xl font-bold text-gray-800 mb-1">Area riservata</h2>
        <p className="text-gray-500 mb-6">
          Strumenti di gestione riservati. Le sotto-sezioni verranno aggiunte qui.
        </p>

        {/* Sotto-attività dell'area Amministrazione */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/amministrazione/permessi"
            className="group relative bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 overflow-hidden"
          >
            <span className="absolute inset-x-0 top-0 h-1.5 bg-slate-600" />
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl bg-slate-600/15 text-slate-700">
              🔐
            </div>
            <h3 className="mt-4 font-bold text-gray-800 text-lg">Permessi Accessi</h3>
            <p className="text-sm text-gray-500 mt-1">
              Gestisci chi può accedere alle aree dell&apos;app
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-700 group-hover:gap-2 transition-all">
              Apri →
            </span>
          </Link>

          <Link
            href="/amministrazione/software"
            className="group relative bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 overflow-hidden"
          >
            <span className="absolute inset-x-0 top-0 h-1.5 bg-slate-600" />
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl bg-slate-600/15 text-slate-700">
              💻
            </div>
            <h3 className="mt-4 font-bold text-gray-800 text-lg">Gestione Software</h3>
            <p className="text-sm text-gray-500 mt-1">
              Servizi, credenziali, scadenze e fatture degli abbonamenti
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-700 group-hover:gap-2 transition-all">
              Apri →
            </span>
          </Link>
        </section>
      </main>
    </div>
  )
}
