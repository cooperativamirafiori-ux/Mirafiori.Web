import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cooperativa Mirafiori',
  description: 'Gestione interna — Manutenzioni, Timbrature, Ritenute',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  )
}
