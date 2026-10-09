/**
 * Hub della sezione Controllo di Gestione.
 *
 * La porta non ha un permesso proprio: si entra se se ne ha almeno uno dei
 * suoi, e dentro si vedono solo le card che il proprio permesso apre. È il
 * motivo per cui domani un coordinatore potrà guardare il cruscotto del suo
 * centro di costo senza che nessuno debba ricordarsi di togliergli le fatture.
 *
 * I coordinatori entrano anche senza alcun permesso: la scheda Qonto si apre
 * a chi è nominato sulla lista Centri di Costo (lib/qonto/accesso.ts).
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/ui/Header'
import { puoEntrareControlloGestione, puoVedereFlussiFatture } from '@/lib/core/permessi'
import { accessoQonto, puoVedereQonto } from '@/lib/qonto/accesso'
import { accessoAssegnazione, puoAssegnare } from '@/lib/pagamenti/assegnazione'
import { puoUsareCuraAmbienti } from '@/lib/cura-ambienti/accesso'
import { accessoStrutture, puoVedereCostiStrutture } from '@/lib/costi-strutture/data'

export const dynamic = 'force-dynamic'

export default async function ControlloGestionePage() {
  const session = await auth()
  const permessi = session?.user?.permessi
  // Si entra anche senza permessi, se si è coordinatori di un centro di costo:
  // dentro si vede solo la scheda Qonto, col conto del proprio servizio.
  const qonto = puoVedereQonto(await accessoQonto(session?.user))
  if (!puoEntrareControlloGestione(permessi) && !qonto) redirect('/home')

  const flussi = puoVedereFlussiFatture(permessi)
  const assegna = puoAssegnare(await accessoAssegnazione(session?.user))
  const curaAmbienti = await puoUsareCuraAmbienti(session?.user)
  const costiStrutture = puoVedereCostiStrutture(await accessoStrutture(session?.user))

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Controllo di Gestione" backHref="/home" backLabel="Torna alla Home" />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Costi, scadenze, decisioni</h2>
        <p className="text-gray-500 mb-6">
          Le fatture da pagare e, man mano, i costi per centro di costo. Ogni parte ha il
          suo permesso: qui vedi solo quello a cui hai accesso.
        </p>

        {qonto && (
          <Link
            href="/controllo-gestione/cruscotto"
            className="group relative mb-4 block overflow-hidden rounded-2xl bg-[#0b1f5c] p-5 text-white shadow-lg shadow-primary/20 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
          >
            <span className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-brand-cyan/40 blur-2xl" />
            <span className="pointer-events-none absolute -bottom-12 left-1/3 h-32 w-32 rounded-full bg-brand-orange/30 blur-2xl" />
            <span className="relative flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl">📊</span>
              <span className="min-w-0">
                <span className="block text-lg font-bold">Cruscotto</span>
                <span className="block text-sm text-white/75">Costi, ricavi e ore per centro di costo e per area</span>
              </span>
              <span className="ml-auto text-sm font-semibold text-brand-cyan-light transition-all group-hover:translate-x-1">→</span>
            </span>
          </Link>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {qonto && (
            <Card
              href="/controllo-gestione/qonto"
              emoji="🏦"
              titolo="Qonto"
              testo="Saldo e ultimi movimenti dei conti dei servizi"
            />
          )}
          {assegna && (
            <Card
              href="/controllo-gestione/fatture"
              emoji="📥"
              titolo="Fatture del servizio"
              testo="Segna le fatture arrivate che sono del tuo servizio"
            />
          )}
          {curaAmbienti && (
            <Card
              href="/controllo-gestione/cura-ambienti"
              emoji="🧹"
              titolo="Cura Ambienti"
              testo="Preventivi e consuntivi dei lavori di pulizia e manutenzione"
            />
          )}
          {costiStrutture && (
            <Card
              href="/amministrazione/costi-strutture"
              emoji="🏠"
              titolo="Costi per struttura"
              testo="Utenze, manutenzioni, pulizie e costi fissi delle strutture"
            />
          )}
          {flussi && (
            <Card
              href="/controllo-gestione/flussi-fatture"
              emoji="🧾"
              titolo="Flussi fatture"
              testo="Scadenzario, fatture da pagare e approvazioni sopra soglia"
            />
          )}
        </section>

        {!flussi && !qonto && (
          <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl px-4 py-6 text-center">
            Qui non c'è ancora niente per te.
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
