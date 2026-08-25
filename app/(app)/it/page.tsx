import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { getRubrica } from '@/lib/core/rubrica'
import { getAreaIT } from '@/lib/it/data'
import { AREA_IT } from '@/types/it'
import { AreaITSchermo } from './AreaITSchermo'

export const dynamic = 'force-dynamic'

export default async function AreaITPage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA_IT)) redirect('/home')

  const [area, rubrica] = await Promise.all([getAreaIT(), getRubrica()])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="IT e Dispositivi" backHref="/home" backLabel="Torna alla Home" />
      <main className="flex-1 px-4 py-6 max-w-5xl mx-auto w-full space-y-4">
        {area.mancanti.length > 0 && (
          <Banner tono="avviso">
            Non è configurato tutto: mancano{' '}
            <code className="font-mono">{area.mancanti.join(', ')}</code>. Lancia{' '}
            <code className="font-mono">node scripts/provision-inventario.mjs</code> e{' '}
            <code className="font-mono">node scripts/provision-it.mjs</code>.
          </Banner>
        )}

        <AreaITSchermo area={area} rubrica={rubrica} />
      </main>
    </div>
  )
}
