/**
 * Guard e helper condivisi dalle API route Timbrature.
 *   - AREA_OPERATORE: permesso richiesto agli operatori per timbrare
 *   - AREA_HR: permesso richiesto alle Risorse Umane per cruscotto/chiusura
 *
 * Il cruscotto HR legge da Supabase: qui il permesso applicativo è il vero
 * controllo di accesso, non un filtro di visibilità come per le anagrafiche
 * (vedi lib/gruppo-ru.ts). Per questo ha un permesso proprio.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'
import { ensureDipendente } from '@/lib/timbrature'
import type { Dipendente } from '@/types/timbrature'

export const AREA_HR = 'Timbrature HR'

/**
 * Permesso storico, prima che il cruscotto presenze avesse il suo.
 *
 * ⚠️ RIPIEGO TEMPORANEO. Va rimosso quando nella lista SP Autorizzazioni ogni
 * persona che usa il cruscotto presenze ha una riga "Timbrature HR". Serve solo
 * a non chiudere il cruscotto a tutti nell'intervallo fra il rilascio di questo
 * codice e la migrazione delle righe. Vedi punto 14 del piano RU.
 */
const AREA_HR_LEGACY = 'Risorse Umane'

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
  const permessi = session.user.permessi ?? []
  if (!permessi.includes(AREA_HR) && !permessi.includes(AREA_HR_LEGACY)) {
    return { session: null, error: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) }
  }
  return { session, error: null }
}
