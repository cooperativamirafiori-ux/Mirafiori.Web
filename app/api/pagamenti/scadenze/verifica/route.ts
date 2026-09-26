/**
 * POST   /api/pagamenti/scadenze/verifica — risponde alle righe "da verificare"
 *        { ids, esito: 'negozio' | 'gia_pagata' | 'da_pagare', data? }
 * DELETE /api/pagamenti/scadenze/verifica — annulla la risposta { ids, pive }
 *
 * Permesso: 'Pagamenti'.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPagamento } from '@/lib/pagamenti/guard'
import { verifica, riapriVerifica } from '@/lib/pagamenti/verifica'
import { logAzione } from '@/lib/core/audit'
import type { EsitoVerifica } from '@/types/pagamenti'

export const dynamic = 'force-dynamic'

const ESITI: EsitoVerifica[] = ['negozio', 'gia_pagata', 'da_pagare']

const stringhe = (v: unknown, max = 500): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, max) : []

async function corpo(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const g = await guardPagamento()
  if (g.error) return g.error
  const b = await corpo(req)
  if (!b) return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  const ids = stringhe(b.ids)
  const esito = b.esito as EsitoVerifica
  if (ids.length === 0) return NextResponse.json({ error: 'Nessuna scadenza indicata' }, { status: 400 })
  if (!ESITI.includes(esito)) return NextResponse.json({ error: 'Risposta non valida' }, { status: 400 })

  try {
    const r = await verifica(ids, esito, g.email, typeof b.data === 'string' ? b.data : undefined)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.verifica',
      entita: 'Scadenza',
      entitaId: ids.length === 1 ? ids[0] : null,
      dettagli: { ids, esito, data: b.data ?? null, aggiornate: r.aggiornate, ignorate: r.ignorate, imparati: r.imparati },
    })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Operazione non riuscita' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guardPagamento()
  if (g.error) return g.error
  const b = await corpo(req)
  if (!b) return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  const ids = stringhe(b.ids)
  if (ids.length === 0) return NextResponse.json({ error: 'Nessuna scadenza indicata' }, { status: 400 })

  try {
    const r = await riapriVerifica(ids, stringhe(b.pive, 50), g.email)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.verifica.annulla',
      entita: 'Scadenza',
      entitaId: ids.length === 1 ? ids[0] : null,
      dettagli: { ids, pive: b.pive ?? [], aggiornate: r.aggiornate, ignorate: r.ignorate },
    })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Annullamento non riuscito' }, { status: 400 })
  }
}
