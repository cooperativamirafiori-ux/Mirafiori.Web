import NextAuth from 'next-auth'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'
import { isAdmin } from '@/lib/sharepoint'

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
      // Arricchisce la sessione con il flag admin (letto da SP)
      if (session.user?.email) {
        session.user.isAdmin = await isAdmin(session.user.email)
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },
})

// Estensione tipi NextAuth
declare module 'next-auth' {
  interface User {
    isAdmin?: boolean
  }
  interface Session {
    user: {
      name?: string | null
      email?: string | null
      image?: string | null
      isAdmin?: boolean
    }
  }
}
