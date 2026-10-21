import { Header } from '@/components/ui/Header'
import { NuovaPrestazioneForm } from './NuovaPrestazioneForm'
import { getCentriDiCosto } from '@/lib/centri-costo/data'

export const dynamic = 'force-dynamic'

export default async function NuovaPrestazionePage() {
  const centri = await getCentriDiCosto()
  return (
    <div className="min-h-screen flex flex-col">
      <Header title="Nuova Prestazione" backHref="/prestazioni" backLabel="Torna a Prestazioni Occasionali" />
      <main className="flex-1 px-4 py-6 max-w-xl mx-auto w-full">
        <NuovaPrestazioneForm centri={centri} />
      </main>
    </div>
  )
}
