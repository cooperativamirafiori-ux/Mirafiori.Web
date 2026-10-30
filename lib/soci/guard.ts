/**
 * Chi può toccare una domanda di ammissione: solo chi l'ha compilata.
 * Nessun permesso d'area: la domanda è aperta a tutti (Dennis, 29/10/2026).
 */

import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { auth } from '@/lib/core/auth'
import { getDomanda, graphSoci, sociConfigurato, type DomandaInterna } from './data'

export const errore = (msg: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: msg, ...extra }, { status })

type Esito =
  | { session: Session; domanda: DomandaInterna; risposta: null }
  | { session: null; domanda: null; risposta: NextResponse }

export async function guardSessione(): Promise<{ session: Session; risposta: null } | { session: null; risposta: NextResponse }> {
  if (!sociConfigurato()) return { session: null, risposta: errore('Sezione non ancora configurata: avvisa le Risorse Umane.', 503) }
  const session = await auth()
  if (!session?.user?.email) return { session: null, risposta: errore('Non autenticato', 401) }
  return { session, risposta: null }
}

export async function guardDomanda(id: string): Promise<Esito> {
  const s = await guardSessione()
  if (s.risposta) return { session: null, domanda: null, risposta: s.risposta }
  const domanda = await getDomanda(graphSoci(), id)
  if (!domanda || domanda.email !== s.session.user.email!.toLowerCase()) {
    return { session: null, domanda: null, risposta: errore('Domanda non trovata', 404) }
  }
  return { session: s.session, domanda, risposta: null }
}
