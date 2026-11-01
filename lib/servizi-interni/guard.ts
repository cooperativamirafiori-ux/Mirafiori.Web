/** Guardia comune alle route degli addebiti interni. */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { accessoServiziInterni, puoUsareServiziInterni, type AccessoServiziInterni } from './accesso'

export async function guardServiziInterni(): Promise<
  | { error: NextResponse; email?: undefined; nome?: undefined; accesso?: undefined }
  | { error: null; email: string; nome: string; accesso: AccessoServiziInterni }
> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) }
  const accesso = await accessoServiziInterni(session.user)
  if (!puoUsareServiziInterni(accesso)) return { error: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) }
  return { error: null, email, nome: session.user.name ?? email, accesso }
}
