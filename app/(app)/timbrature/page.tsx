import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { dipendenteAbilitato } from '@/lib/timbrature'
import TimbratureOperatore from './TimbratureOperatore'

export const dynamic = 'force-dynamic'

export default async function TimbraturePage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  // Timbrature riservate a chi è abilitato dall'anagrafica Risorse Umane
  // (spunta "Timbratura attiva" sulla scheda della persona).
  const dipendente = await dipendenteAbilitato(session.user.email)
  if (!dipendente) return <NonAbilitato />

  return <TimbratureOperatore nome={session.user.name ?? ''} />
}

/**
 * Chi non è abilitato non deve trovare una pagina rotta o un errore tecnico:
 * deve capire perché e a chi rivolgersi.
 */
function NonAbilitato() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-primary text-white px-5 pt-4 pb-3">
        <Link href="/home" className="text-white/70 text-sm hover:text-white">← Home</Link>
        <h1 className="text-lg font-bold">Timbrature</h1>
      </div>
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="font-bold text-gray-800 text-lg mb-2">Timbrature non attive</h2>
          <p className="text-sm text-gray-600 mb-4">
            La compilazione del foglio ore non è attiva sul tuo profilo. Chiedi alle
            Risorse Umane di attivarla sulla tua scheda: da quel momento la trovi qui.
          </p>
          <Link href="/home" className="inline-block text-sm font-semibold text-brand-cyan-dark">
            Torna alla home
          </Link>
        </div>
      </div>
    </div>
  )
}
