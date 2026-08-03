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
import { dipendenteAbilitato } from '@/lib/timbrature'
import type { Dipendente } from '@/types/timbrature'

export const AREA_HR = 'Timbrature HR'

/** Messaggio unico per chi non è abilitato: deve dire cosa fare, non solo "no". */
export const MSG_NON_ABILITATO =
  'Timbrature non attive per il tuo profilo. Chiedi alle Risorse Umane di attivarle sulla tua scheda.'

type OperatoreResult =
  | { session: Session; dipendente: Dipendente; error: null }
  | { session: null; dipendente: null; error: NextResponse }

/**
 * Timbrature accessibili solo a chi è ABILITATO dall'anagrafica Risorse Umane
 * (campo "Timbratura attiva" sulla scheda della persona, collegato per mail
 * aziendale — vedi lib/timbrature-sync.ts).
 *
 * Non esiste più l'auto-provisioning al primo accesso: creava nel cruscotto HR
 * persone senza monte ore, quindi con conteggi privi di significato.
 */
export async function guardOperatore(): Promise<OperatoreResult> {
  const session = await auth()
  if (!session?.user?.email) {
    return { session: null, dipendente: null, error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) }
  }
  const dipendente = await dipendenteAbilitato(session.user.email)
  if (!dipendente) {
    return {
      session: null,
      dipendente: null,
      error: NextResponse.json({ error: MSG_NON_ABILITATO, codice: 'non-abilitato' }, { status: 403 }),
    }
  }
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
