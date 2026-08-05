import { Header } from '@/components/ui/Header'

export default function AmazingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-cyan-light/40 via-white to-white">
      <Header title="Amazing" backHref="/home" backLabel="Torna alla Home" />
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="text-5xl mb-4">✨</div>
        <h1 className="text-2xl font-bold text-brand-cyan-dark">Amazing</h1>
        <p className="text-gray-500 mt-2 max-w-xs">
          Una nuova funzione è in arrivo. Resta sintonizzato!
        </p>
      </main>
    </div>
  )
}
