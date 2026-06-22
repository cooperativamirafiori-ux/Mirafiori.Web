import Link from 'next/link'

export default function AmazingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 bg-gradient-to-b from-brand-cyan-light/40 via-white to-white">
      <div className="text-5xl mb-4">✨</div>
      <h1 className="text-2xl font-bold text-brand-cyan-dark">Amazing</h1>
      <p className="text-gray-500 mt-2 max-w-xs">
        Una nuova funzione è in arrivo. Resta sintonizzato!
      </p>
      <Link
        href="/home"
        className="mt-8 inline-block bg-brand-cyan text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
      >
        ← Torna alla Home
      </Link>
    </div>
  )
}
