/**
 * PATCH  /api/pagamenti/uscite/[id] — corregge un'uscita inserita a mano
 * DELETE /api/pagamenti/uscite/[id] — la cancella
 *
 * Permesso: 'Pagamenti'.
 *
 * Entrambe funzionano solo sulle righe con `origine='manuale'` e non ancora
 * pagate: il controllo lo fa `lib/pagamenti/uscite.ts`, che rifiuta gli id
 * delle scadenze da fattura anche se passati a mano a questi endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPagamento } from '@/lib/pagamenti/guard'
import { eliminaUscita, modificaUscita, validaUscita } from '@/lib/pagamenti/uscite'
import { logAzione } from '@/lib/core/audit'
import type { NuovaUscita } from '@/types/pagamenti'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardPagamento()
  if (g.error) return g.error
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const esito = validaUscita((body ?? {}) as Partial<NuovaUscita>)
  if (!esito.ok) {
    return NextResponse.json({ error: esito.errore, campo: esito.campo }, { status: 400 })
  }

  try {
    await modificaUscita(id, esito.valore)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.uscita.modifica',
      entita: 'Scadenza',
      entitaId: id,
      dettagli: { ...esito.valore },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Modifica fallita' },
      { status: 400 },
    )
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardPagamento()
  if (g.error) return g.error
  const { id } = await params

  try {
    await eliminaUscita(id)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.uscita.elimina',
      entita: 'Scadenza',
      entitaId: id,
      dettagli: null,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Cancellazione fallita' },
      { status: 400 },
    )
  }
}
