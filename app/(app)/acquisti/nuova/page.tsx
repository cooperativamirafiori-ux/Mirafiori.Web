import { getCentriDiCosto } from '@/lib/centri-costo/data'
import { Header } from '@/components/ui/Header'
import { NuovaRichiestaAcquistoForm } from './NuovaRichiestaAcquistoForm'

export const dynamic = 'force-dynamic'

/**
 * I parametri in query servono al "Duplica" da "Le mie richieste": il modulo
 * riparte da una richiesta precedente già compilata. Per il materiale di
 * consumo ricorrente è la scorciatoia che verrà usata più di tutte.
 */
export default async function NuovaRichiestaAcquistoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const uno = (k: string) => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }

  const centri = await getCentriDiCosto()

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-orange-light/20 via-white to-white">
      <Header title="Nuova richiesta di acquisto" backHref="/acquisti" backLabel="Torna a Richieste Acquisto" />
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6">
        <NuovaRichiestaAcquistoForm
          centri={centri}
          iniziali={{
            centroCostoId: uno('centroCosto') ?? '',
            descrizione: uno('descrizione') ?? '',
            quantita: uno('quantita') ?? '1',
            link: uno('link') ?? '',
            categoria: uno('categoria') ?? '',
          }}
        />
      </main>
    </div>
  )
}
