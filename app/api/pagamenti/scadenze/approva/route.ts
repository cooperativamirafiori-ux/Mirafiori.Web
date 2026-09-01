/**
 * POST /api/pagamenti/scadenze/approva — approva una o più scadenze sopra soglia.
 *
 * Permesso: 'Approvazione Pagamenti'. Chi ha solo 'Pagamenti' prende 403 anche
 * chiamando questa route a mano: è la ragione per cui i due permessi sono
 * separati, e non basta nascondere il tasto.
 *
 * Non esiste la route opposta. Non approvare è già la decisione.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardApprovazione } from '@/lib/pagamenti/guard'
import { approva } from '@/lib/pagamenti/flusso'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await guardApprovazione()
  if (g.error) return g.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const ids = Array.isArray((body as { ids?: unknown })?.ids)
    ? ((body as { ids: unknown[] }).ids.filter(
        (x): x is string => typeof x === 'string' && x.length > 0,
      ) as string[]).slice(0, 500)
    : []
  if (ids.length === 0) return NextResponse.json({ error: 'Nessuna scadenza indicata' }, { status: 400 })

  try {
    const esito = await approva(ids, g.email)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.approva',
      entita: 'Scadenza',
      entitaId: ids.length === 1 ? ids[0] : null,
      dettagli: { ids, aggiornate: esito.aggiornate, ignorate: esito.ignorate },
    })
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Approvazione fallita' },
      { status: 400 },
    )
  }
}
