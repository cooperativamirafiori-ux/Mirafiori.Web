export { auth as middleware } from '@/lib/auth'

export const config = {
  matcher: [
    // Protegge tutte le route tranne login, api/auth, assets statici e file
    // con estensione (es. /logo-mirafiori.png) — questi ultimi via `.*\..*`
    '/((?!api/auth|_next/static|_next/image|favicon.ico|login|.*\\..*).*)',
  ],
}
