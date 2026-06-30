import NextAuth from 'next-auth'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'
import { isAdmin, getPermessi } from '@/lib/sharepoint'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      // tenantId non nel tipo TS — usiamo URL espliciti per il tenant
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
      authorization: {
        url: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/oauth2/v2.0/authorize`,
        params: { scope: 'openid profile email' },
      },
      token: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/oauth2/v2.0/token`,
    }),
  ],

  callbacks: {
    async session({ session }) {
      // Arricchisce la sessione con il flag admin e i permessi per area (letti da SP)
      if (session.user?.email) {
        const [admin, permessi] = await Promise.all([
          isAdmin(session.user.email),
          getPermessi(session.user.email),
        ])
        session.user.isAdmin = admin
        session.user.permessi = permessi
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },
})

/**
 * Helper: verifica se la sessione ha accesso a una determinata area.
 * Usare nelle pagine/API per proteggere le sezioni.
 */
export function hasPermesso(
  session: { user?: { permessi?: string[] | null } } | null | undefined,
  area: string
): boolean {
  return !!session?.user?.permessi?.includes(area)
}

// Estensione tipi NextAuth
declare module 'next-auth' {
  interface User {
    isAdmin?: boolean
    permessi?: string[]
  }
  interface Session {
    user: {
      name?: string | null
      email?: string | null
      image?: string | null
      isAdmin?: boolean
      permessi?: string[]
    }
  }
}
