import Link from 'next/link'
import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { dipendenteAbilitato, situazioneResponsabile } from '@/lib/timbrature/data'
import TimbratureOperatore from './TimbratureOperatore'

export const dynamic = 'force-dynamic'

export default async function TimbraturePage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  // Timbrature riservate a chi è abilitato dall'anagrafica Risorse Umane
  // (spunta "Timbratura attiva" sulla scheda della persona).
  const [dipendente, situazione] = await Promise.all([
    dipendenteAbilitato(session.user.email),
    situazioneResponsabile(session.user.email),
  ])
  const responsabile = situazione.collaboratori > 0

  // Un responsabile puo' non timbrare (o non essere ancora abilitato) e avere
  // comunque fogli ore da validare: la porta d'ingresso deve esserci lo stesso.
  if (!dipendente) return <NonAbilitato responsabile={responsabile} />

  // L'accesso ai fogli dei collaboratori sta SOTTO la barra blu, dentro la
  // pagina: la vecchia striscia sopra l'intestazione su telefono non si vedeva.
  return (
    <TimbratureOperatore
      nome={session.user.name ?? ''}
      responsabile={responsabile ? situazione : null}
    />
  )
}

/**
 * Chi non è abilitato non deve trovare una pagina rotta o un errore tecnico:
 * deve capire perché e a chi rivolgersi.
 */
function NonAbilitato({ responsabile }: { responsabile: boolean }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Timbrature" backHref="/home" backLabel="Torna alla Home" />
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
        </div>
      </div>
    </div>
  )
}
