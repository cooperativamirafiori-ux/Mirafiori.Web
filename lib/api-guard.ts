/**
 * Guard riutilizzabile per le API route: verifica autenticazione e permesso d'area.
 *
 * Uso:
 *   const g = await guardArea('Prestazioni Occasionali')
 *   if (g.error) return g.error
 *   const session = g.session   // garantito non-null
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
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
