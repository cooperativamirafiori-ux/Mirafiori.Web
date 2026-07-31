'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  // Letto da window e non con useSearchParams, che in una pagina client
  // richiederebbe un confine <Suspense> senza darci nulla in più.
  const [sessioneScaduta, setSessioneScaduta] = useState(false)
  useEffect(() => {
    const motivo = new URLSearchParams(window.location.search).get('motivo')
    setSessioneScaduta(motivo === 'sessione-scaduta')
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-gradient-to-br from-brand-cyan-light/50 via-white to-brand-orange-light/30">
      <div className="bg-white rounded-3xl shadow-xl p-8 sm:p-10 w-full max-w-sm text-center">
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-mirafiori.png"
          alt="Cooperativa Mirafiori"
          className="mx-auto w-48 h-auto"
        />

        {sessioneScaduta ? (
          <div className="mt-6 mb-8 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 text-left">
            La sessione Microsoft è scaduta. Accedi di nuovo per continuare: i dati
            già salvati non sono stati perduti.
          </div>
        ) : (
          <p className="text-gray-500 text-sm mt-6 mb-8">
            Accedi con il tuo account aziendale
          </p>
        )}

        <button
          onClick={() => signIn('microsoft-entra-id', { callbackUrl: '/home' })}
          className="w-full bg-brand-cyan text-white font-semibold py-3 rounded-xl hover:bg-brand-cyan-dark transition-colors"
        >
          Accedi con Microsoft 365
        </button>

        <p className="mt-8 text-xs text-gray-400">
          «Saper essere è saper amare»
        </p>
      </div>
    </div>
  )
}
