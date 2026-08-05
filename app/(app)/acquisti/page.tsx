import Link from 'next/link'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { acquistiConfigurato, getAcquisti, AREA_ACQUISTI } from '@/lib/acquisti'
import { getInventario, inventarioConfigurato } from '@/lib/inventario'
import { STATI_APERTI } from '@/types/acquisti'
import { STATI_BENE_CHIUSI } from '@/types/inventario'

export const dynamic = 'force-dynamic'

export default async function AcquistiPage() {
  const session = await auth()
  const eGestore = session?.user?.permessi?.includes(AREA_ACQUISTI) ?? false
  const configurato = acquistiConfigurato()

  // Contatore sulla card di gestione: sapere quante richieste attendono senza
  // dover aprire la pagina è il motivo per cui la gente ci torna.
  let daGestire = 0
  if (configurato && eGestore) {
    try {
      const tutte = await getAcquisti()
      daGestire = tutte.filter((a) => STATI_APERTI.includes(a.stato)).length
    } catch {
      daGestire = 0
    }
  }

  // Sulla card dell'inventario il numero utile è quanti beni sono in patrimonio,
  // non quanti record esistono: i dismessi restano in lista ma non si contano.
  const inventarioAttivo = inventarioConfigurato()
  let beniInPatrimonio = 0
  if (inventarioAttivo && eGestore) {
    try {
      const beni = await getInventario()
      beniInPatrimonio = beni.filter((b) => !STATI_BENE_CHIUSI.includes(b.statoBene)).length
    } catch {
      beniInPatrimonio = 0
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-orange-light/30 via-white to-white">
      <Header title="Richieste Acquisto" />

      <main className="flex-1 w-full max-w-2xl mx-auto px-5 py-7">
        {!configurato && (
          <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4">
            La sezione non è ancora configurata: manca la lista SharePoint.
            Esegui <code className="font-mono">node scripts/provision-acquisti.mjs</code> e
            imposta <code className="font-mono">SP_LIST_ACQUISTI</code>.
          </div>
        )}

        <ModuloCard
          href="/acquisti/nuova"
          emoji="🛒"
          titolo="Nuova richiesta"
          sottotitolo="Chiedi un bene o un servizio — pochi campi, una schermata"
          principale
        />

        <div className="mt-3 space-y-3">
          <ModuloCard
            href="/acquisti/mie"
            emoji="📋"
            titolo="Le mie richieste"
            sottotitolo="Stato, storico e riordino rapido di quello che hai già chiesto"
          />

          {eGestore && (
            <ModuloCard
              href="/acquisti/gestione"
              emoji="⚙️"
              titolo="Gestione acquisti"
              sottotitolo="Valuta, ordina e chiudi le richieste"
              badge={daGestire > 0 ? String(daGestire) : undefined}
            />
          )}

          {eGestore && inventarioAttivo && (
            <ModuloCard
              href="/inventario"
              emoji="🏷️"
              titolo="Inventario beni"
              sottotitolo="Registro dei beni: scheda, garanzia, documenti e ubicazione"
              badge={beniInPatrimonio > 0 ? String(beniInPatrimonio) : undefined}
            />
          )}
        </div>

        <Link
          href="/home"
          className="mt-8 inline-block text-sm text-gray-500 hover:text-gray-700"
        >
          ← Torna alla Home
        </Link>
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
          ? 'group flex items-center gap-4 rounded-2xl p-5 bg-brand-orange text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all'
          : 'group flex items-center gap-4 rounded-2xl p-4 bg-white border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all'
      }
    >
      <div
        className={`rounded-xl flex items-center justify-center shrink-0 ${
          principale ? 'w-14 h-14 text-3xl bg-white/20' : 'w-12 h-12 text-2xl bg-brand-orange/10'
        }`}
      >
        {emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className={principale ? 'font-bold text-lg' : 'font-bold text-gray-800'}>{titolo}</h2>
          {badge && (
            <span className="text-[11px] font-bold bg-brand-orange text-white px-2 py-0.5 rounded-full">
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
          principale ? 'text-white/70' : 'text-brand-orange/60'
        }`}
      >
        →
      </span>
    </Link>
  )
}
