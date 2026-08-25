/**
 * GET /api/rubrica — elenco degli account della cooperativa (nome + email).
 *
 * Alimenta l'autocompletamento di "aggiungi persona" nei permessi.
 * `?fresco=1` salta la cache di dieci minuti (serve dopo aver creato un account).
 *
 * Protetta da "Amministrazione" perché oggi la usa solo quella pagina. Se un
 * domani servisse altrove, allargare qui il controllo — non duplicare la route.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { getRubrica, invalidaRubrica } from '@/lib/core/rubrica'

export async function GET(req: NextRequest) {
  const g = await guardArea('Amministrazione')
  if (g.error) return g.error

  if (req.nextUrl.searchParams.get('fresco') === '1') invalidaRubrica()

  // getRubrica non lancia: se Graph è muto torna vuota e la UI ricade
  // sull'inserimento manuale dell'email.
  const rubrica = await getRubrica()
  return NextResponse.json({ rubrica })
}
