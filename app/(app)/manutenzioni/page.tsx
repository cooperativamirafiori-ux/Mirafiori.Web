import { auth } from '@/lib/core/auth'
import Link from 'next/link'
import { Header } from '@/components/ui/Header'

export default async function ManutenzioniPage() {
  const session = await auth()
  const isAdmin = session?.user?.isAdmin ?? false

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Manutenzioni" backHref="/home" backLabel="Torna alla Home" />

      <main className="flex-1 px-4 py-7 w-full max-w-md mx-auto flex flex-col">
        <h2 className="text-lg font-bold text-primary-dark mb-6">Gestione Manutenzioni</h2>

        <section className="flex flex-col gap-4">
          <ModuloCard
            href="/nuova-richiesta"
            emoji="➕"
            iconBg="bg-accent-purple"
            titolo="Nuova richiesta"
            sottotitolo="Segnala un intervento di manutenzione"
          />

          <ModuloCard
            href="/mie-richieste"
            emoji="📋"
            iconBg="bg-primary"
            titolo="Le mie richieste"
            sottotitolo="Controlla lo stato delle tue segnalazioni"
          />

          {isAdmin && (
            <>
              <ModuloCard
                href="/dashboard"
                emoji="⚙️"
                iconBg="bg-accent-yellow"
                iconText="text-primary-dark"
                titolo="Pannello di controllo"
                sottotitolo="Gestisci e assegna le richieste"
                badge="Admin"
              />

              <ModuloCard
                href="/inserisci-costo"
                emoji="💶"
                iconBg="bg-emerald-600"
                titolo="Inserisci costo"
                sottotitolo="Registra un costo diretto su una struttura"
                badge="Admin"
              />

              <ModuloCard
                href="/cruscotto-costi"
                emoji="📊"
                iconBg="bg-brand-cyan-dark"
                titolo="Cruscotto costi"
                sottotitolo="Costi per struttura da inizio anno"
                badge="Admin"
              />
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function ModuloCard({
  href,
  emoji,
  iconBg,
  iconText = 'text-white',
  titolo,
  sottotitolo,
  badge,
}: {
  href: string
  emoji: string
  iconBg: string
  iconText?: string
  titolo: string
  sottotitolo: string
  badge?: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5 transition-all duration-200"
    >
      <div
        className={`shrink-0 w-12 h-12 rounded-xl ${iconBg} ${iconText} flex items-center justify-center text-xl`}
      >
        {emoji}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-800">{titolo}</h2>
          {badge && (
            <span className="text-[10px] font-bold uppercase tracking-wide bg-accent-yellow/20 text-primary-dark px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 truncate">{sottotitolo}</p>
      </div>

      <span className="shrink-0 text-gray-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all">
        →
      </span>
    </Link>
  )
}
