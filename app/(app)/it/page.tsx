import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { getRubrica } from '@/lib/core/rubrica'
import { getAreaIT } from '@/lib/it/data'
import { getInventario, inventarioConfigurato } from '@/lib/inventario/data'
import { STATI_BENE_CHIUSI } from '@/types/inventario'
import { AREA_IT } from '@/types/it'
import { AreaITSchermo } from './AreaITSchermo'

export const dynamic = 'force-dynamic'

export default async function AreaITPage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA_IT)) redirect('/home')

  // Sulla card dell'inventario il numero utile è quanti beni sono in patrimonio,
  // non quanti record esistono: i dismessi restano in lista ma non si contano.
  // Un inventario che non risponde non deve far cadere l'area IT.
  const inventarioAttivo = inventarioConfigurato()
  const [area, rubrica, beni] = await Promise.all([
    getAreaIT(),
    getRubrica(),
    inventarioAttivo ? getInventario().catch(() => []) : Promise.resolve([]),
  ])
  const beniInPatrimonio = beni.filter((b) => !STATI_BENE_CHIUSI.includes(b.statoBene)).length

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Beni e IT" backHref="/home" backLabel="Torna alla Home" />
      <main className="flex-1 px-4 py-6 max-w-5xl mx-auto w-full space-y-4">
        {area.mancanti.length > 0 && (
          <Banner tono="avviso">
            Non è configurato tutto: mancano{' '}
            <code className="font-mono">{area.mancanti.join(', ')}</code>. Lancia{' '}
            <code className="font-mono">node scripts/provision-inventario.mjs</code> e{' '}
            <code className="font-mono">node scripts/provision-it.mjs</code>.
          </Banner>
        )}

        {inventarioAttivo && (
          <Link
            href="/inventario"
            className="group flex items-center gap-4 rounded-2xl p-4 bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl bg-primary/10">
              🏷️
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-gray-800">Inventario beni</h2>
                {beniInPatrimonio > 0 && (
                  <span className="text-[11px] font-bold bg-primary text-white px-2 py-0.5 rounded-full">
                    {beniInPatrimonio}
                  </span>
                )}
              </div>
              <p className="text-sm mt-0.5 text-gray-500">
                Tutti i beni, non solo l’IT: scheda, garanzia, documenti e ubicazione
              </p>
            </div>
            <span className="text-xl shrink-0 text-gray-300 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        )}

        <AreaITSchermo area={area} rubrica={rubrica} />
      </main>
    </div>
  )
}
