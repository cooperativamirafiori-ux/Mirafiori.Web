export { auth as middleware } from '@/lib/auth'

export const config = {
  matcher: [
    // Protegge tutte le route tranne login, api/auth, le route pubbliche della
    // notula (upload tokenizzato del prestatore) e della conferma consegna degli
    // acquisti (link tokenizzato nella mail), il cron, gli assets statici e i
    // file con estensione (es. /logo-mirafiori.png) — questi ultimi via `.*\..*`
    '/((?!api/auth|api/notula|notula|api/consegna|consegna|api/cron|api/docusign|_next/static|_next/image|favicon.ico|login|.*\\..*).*)',
  ],
}
