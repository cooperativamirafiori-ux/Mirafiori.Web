/** Guardia comune alle route di Cura Ambienti. */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { puoUsareCuraAmbienti } from './accesso'

export async function guardCuraAmbienti() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) } as const
  if (!(await puoUsareCuraAmbienti(session.user))) {
    return { error: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) } as const
  }
  return { session, email, error: null } as const
}
