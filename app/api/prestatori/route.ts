/**
 * GET /api/prestatori — Anagrafica prestatori.
 * Ritorna i dati anagrafici distinti (per codice fiscale) ricavati dalle
 * prestazioni già inserite, per la selezione/auto-compilazione nel form.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { getAnagraficaPrestatori } from '@/lib/prestazioni'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  try {
    const prestatori = await getAnagraficaPrestatori()
    return NextResponse.json({ prestatori })
  } catch (err: any) {
    console.error('[GET /api/prestatori]', err)
    return NextResponse.json({ prestatori: [], error: err?.message ?? 'Errore' }, { status: 200 })
  }
}
