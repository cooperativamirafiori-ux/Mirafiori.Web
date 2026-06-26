/**
 * GET /api/prestatori/documenti?cf=CODICEFISCALE
 * Indica se il prestatore ha già i documenti d'identità archiviati nella
 * cartella "Documenti Identità", così il form non li richiede di nuovo.
 *
 * Risposta: { haDocumenti: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { haDocumentiIdentitaPerCf } from '@/lib/prestazioni'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const cf = (req.nextUrl.searchParams.get('cf') || '').trim()
  if (!cf) {
    return NextResponse.json({ haDocumenti: false })
  }

  try {
    const haDocumenti = await haDocumentiIdentitaPerCf(cf)
    return NextResponse.json({ haDocumenti })
  } catch (err: any) {
    console.error('[GET /api/prestatori/documenti]', err)
    // In caso di errore non blocchiamo il form: lasciamo richiedere i documenti
    return NextResponse.json({ haDocumenti: false, error: err?.message ?? 'Errore' })
  }
}
