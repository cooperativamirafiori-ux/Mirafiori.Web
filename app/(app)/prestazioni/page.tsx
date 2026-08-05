import Link from 'next/link'
import { Header } from '@/components/ui/Header'

export default function PrestazioniPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Prestazioni Occasionali" backHref="/home" backLabel="Torna alla Home" />

      <main className="flex-1 px-4 py-7 w-full max-w-md mx-auto flex flex-col">
        <h2 className="text-lg font-bold text-primary-dark mb-6">Ritenute d&apos;acconto</h2>

        <section className="flex flex-col gap-4">
          <ModuloCard
            href="/prestazioni/attive"
            emoji="📋"
            iconBg="bg-primary"
            titolo="Vedi prestazioni attive"
            sottotitolo="Controlla lo stato delle prestazioni in corso"
          />

          <ModuloCard
            href="/prestazioni/nuova"
            emoji="➕"
            iconBg="bg-accent-purple"
            titolo="Inserisci nuova prestazione"
            sottotitolo="Attiva una nuova ritenuta d'acconto"
          />
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
}: {
  href: string
  emoji: string
  iconBg: string
  iconText?: string
  titolo: string
  sottotitolo: string
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
        <h2 className="font-semibold text-gray-800">{titolo}</h2>
        <p className="text-sm text-gray-500 truncate">{sottotitolo}</p>
      </div>

      <span className="shrink-0 text-gray-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all">
        →
      </span>
    </Link>
  )
}
