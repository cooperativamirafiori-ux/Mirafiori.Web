/**
 * Guard riutilizzabile per le API route: verifica autenticazione e permesso d'area.
 *
 * Uso:
 *   const g = await guardArea('Prestazioni Occasionali')
 *   if (g.error) return g.error
 *   const session = g.session   // garantito non-null
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import type { Session } from 'next-auth'

type GuardResult =
  | { session: Session; error: null }
  | { session: null; error: NextResponse }

export async function guardArea(area: string): Promise<GuardResult> {
  const session = await auth()
  if (!session?.user?.email) {
    return { session: null, error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) }
  }
  if (!session.user.permessi?.includes(area)) {
    return { session: null, error: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) }
  }
  return { session, error: null }
}

/**
 * Guard per le anagrafiche Risorse Umane.
 *
 * Non usa un permesso della lista Autorizzazioni: dopo il passaggio al sito
 * dedicato con accesso delegato il cancello è l'appartenenza al gruppo
 * Microsoft 365 del sito, ed è anche ciò che SharePoint verifica per conto suo.
 * Un permesso applicativo in più sarebbe un secondo elenco destinato a
 * divergere — punto 14 di docs/piano-ru-sito-dedicato-accesso-delegato.md.
 *
 * Questo controllo evita all'utente un 403 opaco da Graph; la barriera vera
 * resta SharePoint.
 */
export async function guardMembroRU(): Promise<GuardResult> {
  const session = await auth()
  if (!session?.user?.email) {
    return { session: null, error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) }
  }
  if (!session.user.membroRU) {
    return {
      session: null,
      error: NextResponse.json(
        {
          error:
            'Non fai parte del gruppo Risorse Umane e non puoi accedere ai dati del personale. Contatta Amministrazione.',
          codice: 'permessi-sito',
        },
        { status: 403 },
      ),
    }
  }
  return { session, error: null }
}
