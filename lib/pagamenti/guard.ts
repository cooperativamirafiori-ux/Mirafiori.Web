/**
 * Guardie dei Flussi fatture.
 *
 * Tre livelli, perché tre sono le cose che si possono fare qui e non è detto
 * che chi ne può fare una possa farne un'altra:
 *
 *   guardLettura()     — vedere le due code (chi paga e chi approva)
 *   guardPagamento()   — caricare il file e chiudere una scadenza  → 'Pagamenti'
 *   guardApprovazione() — approvare sopra soglia → 'Approvazione Pagamenti'
 *
 * Il controllo va ripetuto qui anche quando l'interfaccia ha già nascosto il
 * pulsante: nascondere un tasto non è un permesso, è un suggerimento. Chi ha
 * solo 'Pagamenti' deve prendere 403 sull'endpoint di approvazione anche
 * chiamandolo a mano.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import type { Session } from 'next-auth'
import { AREA_PAGAMENTI, AREA_APPROVAZIONE_PAGAMENTI } from '@/types/pagamenti'

export interface Permessi {
  /** Può caricare il file e premere PAGATA. */
  paga: boolean
  /** Può premere APPROVA. */
  approva: boolean
}

type Esito =
  | { session: Session; email: string; permessi: Permessi; error: null }
  | { session: null; email: null; permessi: null; error: NextResponse }

function nega(messaggio: string, stato: number): Esito {
  return {
    session: null,
    email: null,
    permessi: null,
    error: NextResponse.json({ error: messaggio }, { status: stato }),
  }
}

async function base(): Promise<Esito> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return nega('Non autenticato', 401)
  const aree = session.user.permessi ?? []
  const permessi: Permessi = {
    paga: aree.includes(AREA_PAGAMENTI),
    approva: aree.includes(AREA_APPROVAZIONE_PAGAMENTI),
  }
  if (!permessi.paga && !permessi.approva) return nega('Accesso negato', 403)
  return { session, email, permessi, error: null }
}

/** Lettura delle code: basta uno dei due permessi. */
export async function guardLettura(): Promise<Esito> {
  return base()
}

/** Caricamento del file e chiusura di una scadenza. */
export async function guardPagamento(): Promise<Esito> {
  const g = await base()
  if (g.error) return g
  if (!g.permessi.paga) {
    return nega('Serve il permesso “Pagamenti” per registrare un pagamento', 403)
  }
  return g
}

/** Approvazione delle scadenze sopra soglia. */
export async function guardApprovazione(): Promise<Esito> {
  const g = await base()
  if (g.error) return g
  if (!g.permessi.approva) {
    return nega('Serve il permesso “Approvazione Pagamenti” per approvare', 403)
  }
  return g
}
