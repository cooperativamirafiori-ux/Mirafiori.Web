import { auth } from '@/lib/auth'
import Link from 'next/link'
import { LogoutButton } from '@/components/ui/LogoutButton'

export default async function HomePage() {
  const session = await auth()
  const nome = (session?.user?.name ?? '').trim().split(/\s+/)[0] || ''
  const puoAmministrare = session?.user?.permessi?.includes('Amministrazione') ?? false
  const puoPrestazioni = session?.user?.permessi?.includes('Prestazioni Occasionali') ?? false
  const puoRisorseUmane = session?.user?.permessi?.includes('Risorse Umane') ?? false
  const puoTimbrature = session?.user?.permessi?.includes('Timbrature') ?? false

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-cyan-light/40 via-white to-white">
      {/* Barra superiore */}
      <div className="px-5 pt-5 flex justify-end">
        <LogoutButton />
      </div>

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 pb-12 flex flex-col">
        {/* Logo + saluto */}
        <header className="text-center pt-2 pb-9">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mirafiori.png"
            alt="Cooperativa Mirafiori"
            className="mx-auto w-52 sm:w-64 h-auto drop-shadow-sm"
          />
          <h1 className="mt-7 text-2xl sm:text-3xl font-bold text-brand-cyan-dark">
            Ciao{nome ? ` ${nome}` : ''} 👋
          </h1>
          <p className="text-gray-500 mt-1.5">
            Benvenuto nell&apos;app della Cooperativa. Cosa vuoi fare?
          </p>
        </header>

        {/* Funzioni */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FunzioneCard
            href="/manutenzioni"
            emoji="🔧"
            accent="cyan"
            titolo="Richiesta Manutenzione"
            sottotitolo="Segnala e gestisci gli interventi"
          />
          {puoTimbrature && (
            <FunzioneCard
              href="/timbrature"
              emoji="⏱️"
              accent="cyan"
              titolo="Timbrature"
              sottotitolo="Registra le ore e controlla il tuo monte ore"
            />
          )}
          {puoPrestazioni && (
            <FunzioneCard
              href="/prestazioni"
              emoji="📄"
              accent="purple"
              titolo="Prestazioni Occasionali"
              sottotitolo="Attiva e gestisci le ritenute d'acconto"
            />
          )}
          <FunzioneCard
            href="/acquisti"
            emoji="🛒"
            accent="orange"
            titolo="Richiesta Acquisto"
            sottotitolo="Richiedi materiali e forniture"
            badge="Presto"
          />
          <FunzioneCard
            href="https://amazingmirafiori.netlify.app/"
            emoji="✨"
            accent="cyan"
            titolo="Amazing"
            sottotitolo="Vai al sito Amazing Mirafiori"
          />
          {puoRisorseUmane && (
            <FunzioneCard
              href="/risorse-umane"
              emoji="👥"
              accent="emerald"
              titolo="Risorse Umane"
              sottotitolo="Gestione del personale"
            />
          )}
          {puoAmministrare && (
            <FunzioneCard
              href="/amministrazione"
              emoji="⚙️"
              accent="slate"
              titolo="Amministrazione"
              sottotitolo="Strumenti e gestione riservata"
            />
          )}
        </section>

        <p className="mt-auto pt-12 text-center text-xs text-gray-400">
          Cooperativa Mirafiori · «Saper essere è saper amare»
        </p>
      </main>
    </div>
  )
}

const ACCENTS = {
  cyan: {
    bar: 'bg-brand-cyan',
    iconBg: 'bg-brand-cyan/15 text-brand-cyan-dark',
    link: 'text-brand-cyan-dark',
  },
  orange: {
    bar: 'bg-brand-orange',
    iconBg: 'bg-brand-orange/15 text-brand-orange',
    link: 'text-brand-orange',
  },
  purple: {
    bar: 'bg-accent-purple',
    iconBg: 'bg-accent-purple/15 text-accent-purple',
    link: 'text-accent-purple',
  },
  slate: {
    bar: 'bg-slate-600',
    iconBg: 'bg-slate-600/15 text-slate-700',
    link: 'text-slate-700',
  },
  emerald: {
    bar: 'bg-emerald-600',
    iconBg: 'bg-emerald-600/15 text-emerald-700',
    link: 'text-emerald-700',
  },
} as const

function FunzioneCard({
  href,
  emoji,
  accent,
  titolo,
  sottotitolo,
  badge,
}: {
  href: string
  emoji: string
  accent: keyof typeof ACCENTS
  titolo: string
  sottotitolo: string
  badge?: string
}) {
  const a = ACCENTS[accent]
  const isExterno = href.startsWith('http')
  return (
    <Link
      href={href}
      {...(isExterno ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="group relative bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 overflow-hidden"
    >
      <span className={`absolute inset-x-0 top-0 h-1.5 ${a.bar}`} />

      <div className="flex items-start justify-between">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${a.iconBg}`}
        >
          {emoji}
        </div>
        {badge && (
          <span className="text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
            {badge}
          </span>
        )}
      </div>

      <h2 className="mt-4 font-bold text-gray-800 text-lg">{titolo}</h2>
      <p className="text-sm text-gray-500 mt-1">{sottotitolo}</p>

      <span
        className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${a.link} group-hover:gap-2 transition-all`}
      >
        {isExterno ? 'Vai ↗' : 'Apri →'}
      </span>
    </Link>
  )
}
