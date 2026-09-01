/**
 * Hub della sezione Controllo di Gestione.
 *
 * La porta non ha un permesso proprio: si entra se se ne ha almeno uno dei
 * suoi, e dentro si vedono solo le card che il proprio permesso apre. È il
 * motivo per cui domani un coordinatore potrà guardare il cruscotto del suo
 * centro di costo senza che nessuno debba ricordarsi di togliergli le fatture.
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/ui/Header'
import { puoEntrareControlloGestione, puoVedereFlussiFatture } from '@/lib/core/permessi'

export const dynamic = 'force-dynamic'

export default async function ControlloGestionePage() {
  const session = await auth()
  const permessi = session?.user?.permessi
  if (!puoEntrareControlloGestione(permessi)) redirect('/home')

  const flussi = puoVedereFlussiFatture(permessi)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Controllo di Gestione" backHref="/home" backLabel="Torna alla Home" />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Costi, scadenze, decisioni</h2>
        <p className="text-gray-500 mb-6">
          Le fatture da pagare e, man mano, i costi per centro di costo. Ogni parte ha il
          suo permesso: qui vedi solo quello a cui hai accesso.
        </p>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {flussi && (
            <Card
              href="/controllo-gestione/flussi-fatture"
              emoji="🧾"
              titolo="Flussi fatture"
              testo="Scadenzario, fatture da pagare e approvazioni sopra soglia"
            />
          )}
        </section>

        {!flussi && (
          <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl px-4 py-6 text-center">
            I cruscotti dei costi non sono ancora attivi. Arriveranno qui.
          </p>
        )}
      </main>
    </div>
  )
}

function Card({
  href,
  emoji,
  titolo,
  testo,
}: {
  href: string
  emoji: string
  titolo: string
  testo: string
}) {
  return (
    <Link
      href={href}
      className="group relative bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 overflow-hidden"
    >
      <span className="absolute inset-x-0 top-0 h-1.5 bg-slate-600" />
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl bg-slate-600/15 text-slate-700">
        {emoji}
      </div>
      <h3 className="mt-4 font-bold text-gray-800 text-lg">{titolo}</h3>
      <p className="text-sm text-gray-500 mt-1">{testo}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-700 group-hover:gap-2 transition-all">
        Apri →
      </span>
    </Link>
  )
}
