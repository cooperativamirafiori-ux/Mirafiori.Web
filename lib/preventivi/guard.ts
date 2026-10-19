/** Guardia comune alle route dei Preventivi. */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { accessoPreventivi, puoEntrare } from './accesso'
import { preventiviConfigurati } from './data'

export async function guardPreventivi(opts: { soloTutti?: boolean } = {}) {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) } as const
  if (!preventiviConfigurati()) {
    return { error: NextResponse.json({ error: 'Sezione Preventivi non ancora configurata' }, { status: 503 }) } as const
  }
  const accesso = await accessoPreventivi(session.user)
  if (!puoEntrare(accesso) || (opts.soloTutti && !accesso.tutti)) {
    return { error: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) } as const
  }
  return { session, email: email.toLowerCase(), nome: session.user?.name ?? '', accesso, error: null } as const
}

/** Un errore delle operazioni → risposta JSON con lo stato giusto. */
export function rispostaErrore(e: unknown, predefinito = 400) {
  const stato = typeof (e as { stato?: unknown })?.stato === 'number' ? (e as { stato: number }).stato : predefinito
  return NextResponse.json({ error: e instanceof Error ? e.message : 'Operazione non riuscita' }, { status: stato })
}

export async function leggiCorpo(req: Request): Promise<Record<string, any> | null> {
  try {
    const b = await req.json()
    return b && typeof b === 'object' ? b : null
  } catch {
    return null
  }
}
