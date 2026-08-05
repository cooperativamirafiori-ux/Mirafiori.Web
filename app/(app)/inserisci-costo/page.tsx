import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { getStrutture, getCosti, getTecnici } from '@/lib/sharepoint'
import { Header } from '@/components/ui/Header'
import { InserisciCostoForm } from './InserisciCostoForm'

export const dynamic = 'force-dynamic'

export default async function InserisciCostoPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/home')

  const [strutture, costi, tecnici] = await Promise.all([
    getStrutture(),
    getCosti().catch(() => []),
    getTecnici().catch(() => []),
  ])

  // Suggerimenti categoria (datalist): set standard + categorie già usate
  const standard = [
    'Manutenzione ordinaria',
    'Manutenzione straordinaria',
    'Pulizia straordinaria',
    'Utenze',
    'IMU',
    'Assicurazione',
    'Altro',
  ]
  const categorie = Array.from(
    new Set([...standard, ...costi.map((c) => c.categoria).filter(Boolean)])
  ).sort((a, b) => a.localeCompare(b, 'it'))

  // Suggerimenti fornitore: nomi tecnici dall'Anagrafica (come nei ticket) +
  // fornitori già usati nei costi esistenti.
  const fornitori = Array.from(
    new Set([
      ...tecnici.map((t) => t.title).filter(Boolean),
      ...costi.map((c) => c.fornitore ?? '').filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b, 'it'))

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Inserisci Costo" />
      <main className="flex-1 px-4 py-6 max-w-xl mx-auto w-full">
        <InserisciCostoForm
          strutture={strutture}
          categorie={categorie}
          fornitori={fornitori}
        />
      </main>
    </div>
  )
}
