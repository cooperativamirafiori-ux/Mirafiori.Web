import Link from 'next/link'
import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { dipendenteAbilitato, eResponsabile } from '@/lib/timbrature/data'
import TimbratureOperatore from './TimbratureOperatore'

export const dynamic = 'force-dynamic'

export default async function TimbraturePage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  // Timbrature riservate a chi è abilitato dall'anagrafica Risorse Umane
  // (spunta "Timbratura attiva" sulla scheda della persona).
  const [dipendente, responsabile] = await Promise.all([
    dipendenteAbilitato(session.user.email),
    eResponsabile(session.user.email),
  ])

  // Un responsabile puo' non timbrare (o non essere ancora abilitato) e avere
  // comunque fogli ore da validare: la porta d'ingresso deve esserci lo stesso.
  if (!dipendente) return <NonAbilitato responsabile={responsabile} />

  return (
    <>
      {responsabile && <BarraResponsabile />}
      <TimbratureOperatore nome={session.user.name ?? ''} />
    </>
  )
}

/** Scorciatoia verso i fogli ore dei collaboratori, per chi ne ha. */
function BarraResponsabile() {
  return (
    <div className="bg-accent-purple/10 border-b border-accent-purple/20 px-5 py-2.5 text-sm flex items-center justify-between gap-3">
      <span className="text-accent-purple font-medium">Hai collaboratori da seguire</span>
      <Link
        href="/timbrature/validazione"
        className="shrink-0 font-semibold text-accent-purple hover:underline"
      >
        Fogli ore da validare →
      </Link>
    </div>
  )
}

/**
 * Chi non è abilitato non deve trovare una pagina rotta o un errore tecnico:
 * deve capire perché e a chi rivolgersi.
 */
function NonAbilitato({ responsabile }: { responsabile: boolean }) {
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
          {responsabile && (
            <Link
              href="/timbrature/validazione"
              className="block mb-4 text-sm font-semibold text-accent-purple"
            >
              Vai ai fogli ore dei tuoi collaboratori →
            </Link>
          )}
          <Link href="/home" className="inline-block text-sm font-semibold text-brand-cyan-dark">
            Torna alla home
          </Link>
        </div>
      </div>
    </div>
  )
}
