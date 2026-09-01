/**
 * POST   /api/pagamenti/scadenze/pagata — chiude una o più scadenze
 * DELETE /api/pagamenti/scadenze/pagata — annulla la chiusura
 *
 * Permesso: 'Pagamenti'. Il controllo si rifà qui anche se l'interfaccia ha
 * già nascosto il tasto: nascondere un pulsante è un suggerimento, non un
 * permesso.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPagamento } from '@/lib/pagamenti/guard'
import { segnaPagate, annullaPagamento } from '@/lib/pagamenti/flusso'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

function leggiIds(body: unknown): string[] {
  const ids = (body as { ids?: unknown })?.ids
  if (!Array.isArray(ids)) return []
  return ids.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 500)
}

export async function POST(req: NextRequest) {
  const g = await guardPagamento()
  if (g.error) return g.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const ids = leggiIds(body)
  if (ids.length === 0) return NextResponse.json({ error: 'Nessuna scadenza indicata' }, { status: 400 })

  const data =
    (body as { data?: string })?.data?.trim() || new Date().toISOString().slice(0, 10)

  try {
    const esito = await segnaPagate(ids, data, g.email)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.pagata',
      entita: 'Scadenza',
      entitaId: ids.length === 1 ? ids[0] : null,
      dettagli: { ids, data, aggiornate: esito.aggiornate, ignorate: esito.ignorate },
    })
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Registrazione fallita' },
      { status: 400 },
    )
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guardPagamento()
  if (g.error) return g.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const ids = leggiIds(body)
  if (ids.length === 0) return NextResponse.json({ error: 'Nessuna scadenza indicata' }, { status: 400 })

  try {
    const esito = await annullaPagamento(ids)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.pagata.annulla',
      entita: 'Scadenza',
      entitaId: ids.length === 1 ? ids[0] : null,
      dettagli: { ids, aggiornate: esito.aggiornate, ignorate: esito.ignorate },
    })
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Annullamento fallito' },
      { status: 400 },
    )
  }
}
