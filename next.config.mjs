/** @type {import('next').NextConfig} */
const nextConfig = {
  // Necessario per next-auth v5 + Graph client
  serverExternalPackages: ['@microsoft/microsoft-graph-client'],
  // Includi i modelli .docx nel bundle serverless della route di generazione documenti
  outputFileTracingIncludes: {
    '/api/prestazioni/[spItemId]/documenti': [
      './lib/templates/prestazione-occasionale/**',
      './lib/allegati-prestatore/**',
    ],
    '/api/prestazioni/[spItemId]/notula': [
      './lib/templates/prestazione-occasionale/**',
    ],
    '/api/risorse-umane/dipendenti/[id]/scheda-socio': [
      './lib/templates/scheda-socio/**',
    ],
  },
  // Android chiede gli asset links esattamente su /.well-known/assetlinks.json, ma Next
  // NON serve le cartelle che iniziano con un punto dentro public/ (provato: 404).
  // Quindi il file sta in public/assetlinks.json e qui si riscrive la rotta.
  // Vedi docs/app-android.md.
  async rewrites() {
    return [
      { source: '/.well-known/assetlinks.json', destination: '/assetlinks.json' },
    ]
  },
}

export default nextConfig
