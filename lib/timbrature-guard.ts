/**
 * Guard e helper condivisi dalle API route Timbrature.
 *   - AREA_OPERATORE: permesso richiesto agli operatori per timbrare
 *   - AREA_HR: permesso richiesto alle Risorse Umane per cruscotto/chiusura
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'
import { ensureDipendente } from '@/lib/timbrature'
import type { Dipendente } from '@/types/timbrature'

export const AREA_HR = 'Risorse Umane'

type OperatoreResult =
  | { session: Session; dipendente: Dipendente; error: null }
  | { session: null; dipendente: null; error: NextResponse }

/**
 * Timbrature accessibili a TUTTI gli utenti autenticati (ogni dipendente timbra).
 * Nessun permesso d'area richiesto: basta la sessione. Risolve (creando al primo
 * accesso) il dipendente collegato all'email.
 */
export async function guardOperatore(): Promise<OperatoreResult> {
  const session = await auth()
  if (!session?.user?.email) {
    return { session: null, dipendente: null, error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) }
  }
  const dipendente = await ensureDipendente(session.user.email, session.user.name ?? '')
  return { session, dipendente, error: null }
}

type HrResult = { session: Session; error: null } | { session: null; error: NextResponse }

export async function guardHr(): Promise<HrResult> {
  const session = await auth()
  if (!session?.user?.email) {
    return { session: null, error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) }
  }
  if (!session.user.permessi?.includes(AREA_HR)) {
    return { session: null, error: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) }
  }
  return { session, error: null }
}
