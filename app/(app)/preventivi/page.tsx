/**
 * Preventivi — hub (22/10/2026). Due tasti:
 *   - Preventivi Servizi: i preventivi agli enti (elenco, tariffario, ISTAT) → /preventivi/servizi
 *   - Preventivi Catering: il calcolatore della Locanda                   → /preventivi/catering
 *
 * Chi entra: come prima (coordinatori dei CC + Amministrazione, lib/preventivi/accesso.ts).
 * I vecchi link `/preventivi?stato=…` (mail di sollecito già spedite) vanno all'elenco.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { accessoPreventivi, puoEntrare } from '@/lib/preventivi/accesso'
import { preventiviConfigurati } from '@/lib/preventivi/data'

export const dynamic = 'force-dynamic'

export default async function PreventiviPage({ searchParams }: { searchParams: Promise<{ stato?: string }> }) {
  const session = await auth()
  const accesso = await accessoPreventivi(session?.user)
  if (!puoEntrare(accesso)) redirect('/home')
  const { stato } = await searchParams
  if (stato) redirect(`/preventivi/servizi?stato=${encodeURIComponent(stato)}`)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Preventivi" backHref="/home" backLabel="Torna alla Home" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Che preventivo devi fare?</h2>
        <p className="text-gray-500 mb-6">Scegli il tipo: ognuno ha i suoi conti e i suoi prezzi.</p>
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {preventiviConfigurati() && (
            <Card
              href="/preventivi/servizi"
              emoji="📝"
              colore="bg-emerald-600"
              titolo="Preventivi Servizi"
              testo="Preventivi agli enti: fai, rinnova e segna l'esito"
            />
          )}
          <Card
            href="/preventivi/catering"
            emoji="🍽️"
            colore="bg-brand-orange"
            titolo="Preventivi Catering"
            testo="Calcola il prezzo di un catering della Locanda: totale e costo a persona"
          />
        </section>
      </main>
    </div>
  )
}

function Card({ href, emoji, colore, titolo, testo }: { href: string; emoji: string; colore: string; titolo: string; testo: string }) {
  return (
    <Link
      href={href}
      className="group relative bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 overflow-hidden"
    >
      <span className={`absolute inset-x-0 top-0 h-1.5 ${colore}`} />
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl bg-gray-100">{emoji}</div>
      <h3 className="mt-4 font-bold text-gray-800 text-lg">{titolo}</h3>
      <p className="text-sm text-gray-500 mt-1">{testo}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-gray-700 group-hover:gap-2 transition-all">
        Apri →
      </span>
    </Link>
  )
}
