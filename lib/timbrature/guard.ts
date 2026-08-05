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
import { auth } from '@/lib/core/auth'
import type { Session } from 'next-auth'
import { dipendenteAbilitato, eResponsabile, getDipendenteById } from '@/lib/timbrature/data'
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


// ---------------------------------------------------------------- validatori

/**
 * Chi puo' controllare e validare i fogli ore altrui.
 *
 * Due strade, di natura diversa:
 *   - le HR hanno il permesso d'area "Timbrature HR" e vedono tutti;
 *   - il responsabile non ha nessun permesso da assegnare: lo diventa perche'
 *     qualcuno lo indica come Referente foglio ore in anagrafica RU. Il ruolo
 *     segue i dati, cosi' non c'e' una seconda lista da tenere allineata.
 */
export interface Validatore {
  session: Session
  email: string
  /** Vede e puo' agire su tutti. */
  hr: boolean
  /** Mail su cui filtrare il cruscotto; null per le HR (nessun filtro). */
  referente: string | null
}

type ValidatoreResult = { v: Validatore; error: null } | { v: null; error: NextResponse }

export async function guardValidatore(): Promise<ValidatoreResult> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return { v: null, error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) }
  }
  const hr = !!session!.user.permessi?.includes(AREA_HR)
  if (hr) return { v: { session: session!, email, hr: true, referente: null }, error: null }

  if (await eResponsabile(email)) {
    return { v: { session: session!, email, hr: false, referente: email }, error: null }
  }
  return {
    v: null,
    error: NextResponse.json(
      { error: 'Questa pagina e\' riservata a chi deve validare i fogli ore dei propri collaboratori.' },
      { status: 403 },
    ),
  }
}

/**
 * Il validatore puo' agire su questo dipendente?
 *
 * Vale anche la regola "nessuno valida se stesso": un foglio ore lo guarda
 * qualcun altro, altrimenti il passaggio non serve a niente. Chi si trova nel
 * proprio elenco (per un referente impostato male) viene comunque escluso.
 */
export async function puoAgireSu(v: Validatore, dipendenteId: number): Promise<string | null> {
  const dip = await getDipendenteById(dipendenteId)
  if (!dip) return 'Dipendente non trovato'
  if (dip.email.toLowerCase() === v.email.toLowerCase()) {
    return 'Non puoi validare il tuo foglio ore: deve farlo il tuo responsabile o le Risorse Umane.'
  }
  if (v.hr) return null
  if ((dip.referenteEmail ?? '').toLowerCase() !== v.email.toLowerCase()) {
    return 'Questo dipendente non e\' fra i tuoi collaboratori.'
  }
  return null
}
