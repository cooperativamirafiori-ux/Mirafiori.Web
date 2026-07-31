import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

// Le tre sezioni non hanno lo stesso cancello: anagrafiche e tirocini stanno su
// SharePoint e seguono l'appartenenza al gruppo M365, il cruscotto presenze
// legge da Supabase e ha il suo permesso applicativo. Mostrare una card che poi
// rimanda alla home sarebbe un vicolo cieco, quindi ognuna dichiara cosa
// richiede. Vedi punto 14 di docs/piano-ru-sito-dedicato-accesso-delegato.md.
const AREA_TIMBRATURE = 'Timbrature HR'
/** Permesso storico: ripiego da rimuovere a migrazione completata. */
const AREA_TIMBRATURE_LEGACY = 'Risorse Umane'

type Requisito = 'gruppoRU' | 'timbratureHr'

const SEZIONI: Array<{
  href: string
  emoji: string
  titolo: string
  sottotitolo: string
  richiede: Requisito
}> = [
  {
    richiede: 'gruppoRU',
    href: '/risorse-umane/dipendenti',
    emoji: '👤',
    titolo: 'Dipendenti e collaboratori',
    sottotitolo: 'Anagrafica di dipendenti e collaboratori, dati contrattuali e cartelle documenti',
  },
  {
    richiede: 'gruppoRU',
    href: '/risorse-umane/tirocini',
    emoji: '🎓',
    titolo: 'Tirocini',
    sottotitolo: 'Tirocinanti e percorsi di inserimento',
  },
  {
    richiede: 'timbratureHr',
    href: '/risorse-umane/timbrature',
    emoji: '⏱️',
    titolo: 'Cruscotto Timbrature',
    sottotitolo: 'Ore di tutti i dipendenti, monte ore settimanale e chiusura mese',
  },
]

export default async function RisorseUmanePage() {
  const session = await auth()
  const permessi = session?.user?.permessi ?? []
  const puoGruppoRU = session?.user?.membroRU ?? false
  const puoTimbratureHr =
    permessi.includes(AREA_TIMBRATURE) || permessi.includes(AREA_TIMBRATURE_LEGACY)

  if (!puoGruppoRU && !puoTimbratureHr) redirect('/home')

  const sezioni = SEZIONI.filter((s) =>
    s.richiede === 'gruppoRU' ? puoGruppoRU : puoTimbratureHr,
  )

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
          Consultazione e gestione del personale: dipendenti e collaboratori (anagrafica unica) e tirocini.
        </p>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sezioni.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group relative bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 overflow-hidden"
            >
              <span className="absolute inset-x-0 top-0 h-1.5 bg-emerald-600" />
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl bg-emerald-600/15 text-emerald-700">
                {s.emoji}
              </div>
              <h3 className="mt-4 font-bold text-gray-800 text-lg">{s.titolo}</h3>
              <p className="text-sm text-gray-500 mt-1">{s.sottotitolo}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 group-hover:gap-2 transition-all">
                Apri →
              </span>
            </Link>
          ))}
        </section>
      </main>
    </div>
  )
}
