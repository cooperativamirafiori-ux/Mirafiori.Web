import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Colori dal design system Power Apps esistente
        primary: {
          DEFAULT: '#3860B2',  // blu primario
          dark: '#00126B',     // blu scuro accent
        },
        accent: {
          yellow: '#FFBF00',   // giallo separatori/CTA admin
          purple: '#6D31A2',   // viola CTA principale
        },
        status: {
          open: '#EF4444',     // rosso Aperta
          working: '#F97316',  // arancio In lavorazione
          done: '#22C55E',     // verde Completata
        },
        kpi: {
          green: '#D1E8B2',
          orange: '#FA9B70',
        },
        // Colori del logo Cooperativa Mirafiori
        brand: {
          cyan: '#4FB9D6',        // azzurro onda/tagline
          'cyan-light': '#A3DAEA',
          'cyan-dark': '#3A9BB8',
          orange: '#EF7A4A',      // arancione wordmark
          'orange-light': '#F6B79D',
        },
      },
      fontFamily: {
        sans: ['Open Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
