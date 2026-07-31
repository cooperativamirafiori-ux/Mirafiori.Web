import NextAuth from 'next-auth'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'
import { isAdmin, getPermessi } from '@/lib/sharepoint'
import { salvaTokenDelegato, SCOPE_DELEGATO } from '@/lib/ms-token'
import { eMembroGruppoRU } from '@/lib/gruppo-ru'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      // tenantId non nel tipo TS — usiamo URL espliciti per il tenant
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
      authorization: {
        url: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/oauth2/v2.0/authorize`,
        // offline_access → refresh token (serve per rinnovare il token delegato
        // lato server); Sites.Selected → scrittura su SharePoint con l'identità
        // dell'utente, limitata ai soli siti concessi all'app (area Risorse Umane).
        // La costante è condivisa con il rinnovo in lib/ms-token.ts: i due
        // insiemi di scope devono coincidere.
        // Vedi docs/piano-ru-sito-dedicato-accesso-delegato.md
        params: { scope: SCOPE_DELEGATO },
      },
      token: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/oauth2/v2.0/token`,
    }),
  ],

  callbacks: {
    /**
     * Al login Entra restituisce `account` con i token: li conserviamo cifrati
     * su Supabase (lib/ms-token.ts), indicizzati per email. Nel JWT — e quindi
     * nel cookie — non finisce nulla di nuovo: un access token Graph pesa 2-3 KB
     * e sfonderebbe il limite di 4 KB del cookie.
     *
     * Serve all'area Risorse Umane, che scrive su SharePoint con l'identità
     * dell'utente. Un salvataggio fallito non deve impedire l'accesso all'app:
     * si registra l'errore e si va avanti; l'utente troverà l'area RU non
     * disponibile con un messaggio esplicito, il resto dell'app funziona.
     */
    async jwt({ token, user, account }) {
      if (account?.access_token && account.refresh_token) {
        const email = (user?.email ?? token.email ?? '').toLowerCase()
        if (email) {
          try {
            await salvaTokenDelegato({
              email,
              accessToken: account.access_token,
              refreshToken: account.refresh_token,
              expiresAt: new Date(
                account.expires_at ? account.expires_at * 1000 : Date.now() + 3600_000,
              ),
            })
          } catch (e) {
            console.error('[auth] salvataggio del token delegato non riuscito', e)
          }
        }
      }
      return token
    },

    async session({ session }) {
      // Arricchisce la sessione con il flag admin, i permessi per area (letti da
      // SP) e l'appartenenza al gruppo M365 Risorse Umane — che per le
      // anagrafiche del personale è la fonte di verità al posto di un permesso
      // applicativo (vedi lib/gruppo-ru.ts e il punto 14 del piano RU).
      if (session.user?.email) {
        const [admin, permessi, membroRU] = await Promise.all([
          isAdmin(session.user.email),
          getPermessi(session.user.email),
          eMembroGruppoRU(session.user.email),
        ])
        session.user.isAdmin = admin
        session.user.permessi = permessi
        session.user.membroRU = membroRU
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
    /** Membro del gruppo M365 "Risorse Umane": governa l'accesso alle anagrafiche. */
    membroRU?: boolean
  }
  interface Session {
    user: {
      name?: string | null
      email?: string | null
      image?: string | null
      isAdmin?: boolean
      permessi?: string[]
      membroRU?: boolean
    }
  }
}
