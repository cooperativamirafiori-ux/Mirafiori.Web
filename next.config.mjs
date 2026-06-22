/** @type {import('next').NextConfig} */
const nextConfig = {
  // Necessario per next-auth v5 + Graph client
  serverExternalPackages: ['@microsoft/microsoft-graph-client'],
}

export default nextConfig
