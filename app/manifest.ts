import type { MetadataRoute } from 'next'

/**
 * Manifest PWA. Serve a due cose:
 *  - "Aggiungi a schermata Home" da browser (Android e iOS);
 *  - alla app Android (TWA): Bubblewrap legge QUESTO file per nome, icone e colori.
 *
 * Next lo pubblica su /manifest.webmanifest, che il middleware lascia passare
 * perché ha un'estensione (regola `.*\..*` in middleware.ts).
 *
 * Se si cambiano nome o icone qui, vanno riallineati anche in `android-twa/twa-manifest.json`
 * e va ricostruito l'APK: l'app installata NON si aggiorna da sola su questi valori.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mirafiori Web',
    short_name: 'Mirafiori',
    description: 'Gestionale interno della Cooperativa Mirafiori',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#3860B2',
    lang: 'it',
    dir: 'ltr',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icona-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icona-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icona-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
