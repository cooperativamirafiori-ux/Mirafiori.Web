/**
 * GET /api/pagamenti/scadenze/cerca?q=… — cerca fra le fatture già chiuse
 * (pagate, stornate, storiche). Le code le filtra l'interfaccia da sé.
 *
 * Permesso: lo stesso della lettura delle code.
 */

import { NextResponse } from 'next/server'
import { guardLettura } from '@/lib/pagamenti/guard'
import { cercaArchivio } from '@/lib/pagamenti/data'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await guardLettura()
  if (g.error) return g.error
  const q = new URL(req.url).searchParams.get('q') ?? ''
  try {
    return NextResponse.json({ righe: await cercaArchivio(q) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore di ricerca' },
      { status: 500 },
    )
  }
}
