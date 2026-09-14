import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cooperativa Mirafiori',
  description: 'Gestione interna — Manutenzioni, Timbrature, Ritenute',
  manifest: '/manifest.webmanifest',
  applicationName: 'Mirafiori Web',
  appleWebApp: {
    capable: true,
    title: 'Mirafiori',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icona-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icona-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#3860B2',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  )
}
