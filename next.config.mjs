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
}

export default nextConfig
