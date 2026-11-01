/**
 * Chi può toccare la pratica di una richiesta, e da che parte.
 *
 * - `gestione`: gli admin delle manutenzioni (`isAdmin`, i tre in codice);
 * - `richiedente`: chi ha aperto la richiesta. Non c'è una vista "della mia
 *   struttura": come prima, ognuno vede solo le sue.
 *
 * Il lato lo dichiara la schermata (`come`) e qui si verifica: un admin che ha
 * aperto lui stesso una richiesta può stare da tutte e due le parti, e deve
 * essere chiaro da quale scrive.
 */

import { auth } from '@/lib/core/auth'
import { getRichiestaById, eRichiedente } from '@/lib/manutenzioni/data'
import type { LatoPratica, RichiestaManutenzione } from '@/types/manutenzioni'

export type EsitoAccesso =
  | { ok: true; lato: LatoPratica; richiesta: RichiestaManutenzione; email: string; nome: string }
  | { ok: false; status: number; error: string }

export function leggiLato(v: unknown): LatoPratica | null {
  return v === 'gestione' || v === 'richiedente' ? v : null
}

export async function accessoPratica(spItemId: string, come: unknown): Promise<EsitoAccesso> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { ok: false, status: 401, error: 'Non autenticato' }
  const lato = leggiLato(come)
  if (!lato) return { ok: false, status: 400, error: 'Parte non indicata' }

  let richiesta: RichiestaManutenzione
  try {
    richiesta = await getRichiestaById(spItemId)
  } catch {
    return { ok: false, status: 404, error: 'Richiesta non trovata' }
  }

  const consentito = lato === 'gestione'
    ? Boolean(session.user.isAdmin)
    : await eRichiedente(richiesta, email)
  if (!consentito) return { ok: false, status: 403, error: 'Accesso negato' }

  return { ok: true, lato, richiesta, email, nome: session.user.name ?? email }
}
