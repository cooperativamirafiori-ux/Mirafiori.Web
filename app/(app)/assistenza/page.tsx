import Link from 'next/link'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { assistenzaConfigurata, getTicket } from '@/lib/assistenza/data'
import { AREA_ASSISTENZA, STATI_APERTI } from '@/types/assistenza'

export const dynamic = 'force-dynamic'

/**
 * Hub dell'assistenza.
 *
 * Chiedere aiuto è di tutti: nessun permesso, nessun controllo — come Richiesta
 * fattura. La card "Gestione" compare invece solo a chi ha l'area
 * "IT e Dispositivi", che è anche l'unica pagina protetta della sezione.
 */
export default async function AssistenzaPage() {
  const session = await auth()
  const eGestore = session?.user?.permessi?.includes(AREA_ASSISTENZA) ?? false
  const configurata = assistenzaConfigurata()

  // Il contatore sulla card è il motivo per cui l'IT ci torna: sapere quanti
  // ticket aspettano senza dover aprire la pagina.
  let daGestire = 0
  if (configurata && eGestore) {
    try {
      const tutti = await getTicket()
      daGestire = tutti.filter((t) => STATI_APERTI.includes(t.stato)).length
    } catch {
      daGestire = 0
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-cyan/10 via-white to-white">
      <Header title="Assistenza IT" backHref="/home" backLabel="Torna alla Home" />

      <main className="flex-1 w-full max-w-2xl mx-auto px-5 py-7">
        {!configurata && (
          <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4">
            La sezione non è ancora configurata: manca la lista SharePoint. Esegui{' '}
            <code className="font-mono">node scripts/provision-assistenza.mjs</code> e imposta{' '}
            <code className="font-mono">SP_LIST_ASSISTENZA</code>.
          </div>
        )}

        <ModuloCard
          href="/assistenza/nuova"
          emoji="🛠"
          titolo="Chiedi assistenza"
          sottotitolo="Un problema con PC, telefono, stampante, rete o un programma"
          principale
        />

        <div className="mt-3 space-y-3">
          <ModuloCard
            href="/assistenza/mie"
            emoji="📋"
            titolo="Le mie richieste"
            sottotitolo="A che punto sono, cosa è stato fatto, e come riaprirle se il problema torna"
          />

          {eGestore && (
            <ModuloCard
              href="/assistenza/gestione"
              emoji="⚙️"
              titolo="Gestione assistenza"
              sottotitolo="Prendi in carico, assegna, chiudi i ticket"
              badge={daGestire > 0 ? String(daGestire) : undefined}
            />
          )}

          {eGestore && (
            <ModuloCard
              href="/it"
              emoji="💻"
              titolo="Dispositivi e SIM"
              sottotitolo="Anagrafica, assegnazioni e verbali"
            />
          )}
        </div>
      </main>
    </div>
  )
}

function ModuloCard({
  href,
  emoji,
  titolo,
  sottotitolo,
  badge,
  principale,
}: {
  href: string
  emoji: string
  titolo: string
  sottotitolo: string
  badge?: string
  principale?: boolean
}) {
  return (
    <Link
      href={href}
      className={
        principale
          ? 'group flex items-center gap-4 rounded-2xl p-5 bg-brand-cyan text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all'
          : 'group flex items-center gap-4 rounded-2xl p-4 bg-white border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all'
      }
    >
      <div
        className={`rounded-xl flex items-center justify-center shrink-0 ${
          principale ? 'w-14 h-14 text-3xl bg-white/20' : 'w-12 h-12 text-2xl bg-brand-cyan/10'
        }`}
      >
        {emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className={principale ? 'font-bold text-lg' : 'font-bold text-gray-800'}>{titolo}</h2>
          {badge && (
            <span className="text-[11px] font-bold bg-brand-cyan text-white px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <p className={`text-sm mt-0.5 ${principale ? 'text-white/85' : 'text-gray-500'}`}>
          {sottotitolo}
        </p>
      </div>
      <span
        className={`text-xl shrink-0 group-hover:translate-x-1 transition-transform ${
          principale ? 'text-white/70' : 'text-brand-cyan/60'
        }`}
      >
        →
      </span>
    </Link>
  )
}
