import { getStrutture } from '@/lib/strutture/data'
import { Header } from '@/components/ui/Header'
import { NuovaRichiestaForm } from './NuovaRichiestaForm'

export default async function NuovaRichiestaPage() {
  const strutture = await getStrutture()

  // Valori choice da SP — allineati ai valori reali della lista
  const tipiIntervento = [
    'Manutenzione ordinaria',
    'Manutenzione straordinaria',
    'Guasto urgente',
    'Pulizia straordinaria',
    'Altro',
  ]
  const priorita = [
    'Normale',
    'Alta',
    'Urgente (esecuzione in giornata)',
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Header title="Nuova Richiesta" backHref="/manutenzioni" backLabel="Torna a Manutenzioni" />
      <main className="flex-1 px-4 py-6 max-w-xl mx-auto w-full">
        <NuovaRichiestaForm
          strutture={strutture}
          tipiIntervento={tipiIntervento}
          priorita={priorita}
        />
      </main>
    </div>
  )
}
