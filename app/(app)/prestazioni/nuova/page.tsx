import { Header } from '@/components/ui/Header'
import { NuovaPrestazioneForm } from './NuovaPrestazioneForm'

export default function NuovaPrestazionePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header title="Nuova Prestazione" />
      <main className="flex-1 px-4 py-6 max-w-xl mx-auto w-full">
        <NuovaPrestazioneForm />
      </main>
    </div>
  )
}
