import { auth } from '@/lib/auth'
import Link from 'next/link'
import { LogoutButton } from '@/components/ui/LogoutButton'

export default async function HomePage() {
  const session = await auth()
  const nome = (session?.user?.name ?? '').trim().split(/\s+/)[0] || ''
  const puoAmministrare = session?.user?.permessi?.includes('Amministrazione') ?? false
  const puoPrestazioni = session?.user?.permessi?.includes('Prestazioni Occasionali') ?? false
  const puoRisorseUmane = session?.user?.permessi?.includes('Risorse Umane') ?? false

  const mostraRiservata = puoRisorseUmane || puoAmministrare

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-cyan-light/40 via-white to-white">
      {/* Barra superiore */}
      <div className="px-5 pt-5 flex justify-end">
        <LogoutButton />
      </div>

      <main className="flex-1 w-full max-w-3xl mx-auto px-5 pb-12 flex flex-col">
        {/* Logo + saluto */}
        <header className="text-center pt-2 pb-8">
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

        {/* Azione principale: usata ogni giorno */}
        <HeroCard
          href="/timbrature"
          emoji="⏱️"
          titolo="Timbratura · Foglio Ore"
          sottotitolo="Registra le ore e controlla il tuo monte ore"
        />

        {/* Operatività */}
        <Sezione titolo="Operatività">
          <FunzioneCard
            href="/manutenzioni"
            emoji="🔧"
            accent="cyan"
            titolo="Richieste Manutenzione"
            sottotitolo="Segnala e gestisci gli interventi"
          />
          <FunzioneCard
            href="/acquisti"
            emoji="🛒"
            accent="orange"
            titolo="Richieste Acquisto"
            sottotitolo="Richiedi materiali e forniture"
            badge="Presto"
          />
          {puoPrestazioni && (
            <FunzioneCard
              href="/prestazioni"
              emoji="📄"
              accent="purple"
              titolo="Prestazioni Occasionali"
              sottotitolo="Attiva e gestisci le ritenute d'acconto"
            />
          )}
        </Sezione>

        {/* Servizi */}
        <Sezione titolo="Servizi">
          <FunzioneCard
            href="https://amazingmirafiori.netlify.app/"
            emoji="✨"
            accent="cyan"
            titolo="Amazing"
            sottotitolo="Vai al sito Amazing Mirafiori"
          />
        </Sezione>

        {/* Aree riservate */}
        {mostraRiservata && (
          <Sezione titolo="Aree Riservate">
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
          </Sezione>
        )}

        <p className="mt-auto pt-12 text-center text-xs text-gray-400">
          Cooperativa Mirafiori · «Saper essere è saper amare»
        </p>
      </main>
    </div>
  )
}

/* ---------- Sezione con titoletto ---------- */
function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="px-1 mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
        {titolo}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </section>
  )
}

/* ---------- Card principale (hero) ---------- */
function HeroCard({
  href,
  emoji,
  titolo,
  sottotitolo,
}: {
  href: string
  emoji: string
  titolo: string
  sottotitolo: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl p-5 bg-brand-cyan-dark text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl bg-white/20 shrink-0">
        {emoji}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-bold text-xl leading-tight">{titolo}</h2>
        <p className="text-sm text-white/85 mt-1">{sottotitolo}</p>
      </div>
      <span className="text-2xl text-white/70 group-hover:translate-x-1 transition-transform shrink-0">
        →
      </span>
    </Link>
  )
}

/* ---------- Card di funzione (riga) ---------- */
const ACCENTS = {
  cyan: {
    tint: 'bg-brand-cyan/10',
    border: 'border-brand-cyan-dark',
    iconBg: 'bg-brand-cyan-dark',
    text: 'text-brand-cyan-dark',
  },
  orange: {
    tint: 'bg-brand-orange/10',
    border: 'border-brand-orange',
    iconBg: 'bg-brand-orange',
    text: 'text-brand-orange',
  },
  purple: {
    tint: 'bg-accent-purple/10',
    border: 'border-accent-purple',
    iconBg: 'bg-accent-purple',
    text: 'text-accent-purple',
  },
  emerald: {
    tint: 'bg-emerald-50',
    border: 'border-emerald-600',
    iconBg: 'bg-emerald-600',
    text: 'text-emerald-700',
  },
  slate: {
    tint: 'bg-slate-50',
    border: 'border-slate-500',
    iconBg: 'bg-slate-600',
    text: 'text-slate-700',
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
      className={`group flex items-center gap-3 rounded-xl border-l-4 ${a.border} ${a.tint} p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}
    >
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl text-white shrink-0 ${a.iconBg}`}
      >
        {emoji}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-800 leading-tight">{titolo}</h3>
          {badge && (
            <span className="text-[10px] font-bold uppercase tracking-wide bg-white text-gray-500 px-2 py-0.5 rounded-full shrink-0">
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5 truncate">{sottotitolo}</p>
      </div>

      <span
        className={`text-xl ${a.text} opacity-60 group-hover:translate-x-1 group-hover:opacity-100 transition-all shrink-0`}
      >
        {isExterno ? '↗' : '→'}
      </span>
    </Link>
  )
}
