/**
 * Nuovo cliente — pagina pubblica aperta dal QR stampato alla cassa.
 *
 * Sta fuori dal gruppo (app) perché non richiede login: la apre il cliente dal
 * suo telefono. Scrive nell'anagrafica Clienti tramite /api/nuovo-cliente, e
 * non legge mai niente di quella anagrafica (vedi lib/clienti/pubblico.ts).
 */

import type { Metadata } from 'next'
import { NuovoClienteForm } from './NuovoClienteForm'

export const metadata: Metadata = {
  title: 'I tuoi dati per la fattura — Cooperativa Mirafiori',
  robots: { index: false, follow: false },
}

export default function NuovoClientePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-cyan-light/40 via-white to-white px-4 py-8">
      <div className="mx-auto w-full max-w-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mirafiori.png" alt="Cooperativa Mirafiori" className="mx-auto mb-6 h-auto w-36" />
        <NuovoClienteForm apertaIl={Date.now()} />
        <p className="mt-8 text-center text-xs text-gray-400">
          Cooperativa Mirafiori · «Saper essere è saper amare»
        </p>
      </div>
    </div>
  )
}
