/**
 * DELETE /api/manutenzioni/[id]/costi/[costoId] — toglie un costo dalla richiesta.
 *
 * Una fattura tolta torna disponibile da collegare e resta su cc24. Solo gestione.
 */

import { NextRequest, NextResponse } from 'next/server'
import { accessoPratica } from '@/lib/manutenzioni/accesso'
import { eliminaCosto, leggiCosti, totaleDi } from '@/lib/manutenzioni/costi'
import { logAzione } from '@/lib/core/audit'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; costoId: string }> }) {
  const { id, costoId } = await params
  const a = await accessoPratica(id, 'gestione')
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })

  try {
    const prima = (await leggiCosti(id)).find((c) => c.id === costoId)
    if (!prima || !(await eliminaCosto(id, costoId))) {
      return NextResponse.json({ error: 'Costo non trovato' }, { status: 404 })
    }
    const costi = await leggiCosti(id)
    const { totale, incompleto } = totaleDi(costi)
    await logAzione({
      utente: a.email,
      nome: a.nome,
      azione: 'manutenzione.costo-tolto',
      entita: 'RichiestaManutenzione',
      entitaId: a.richiesta.idRichiesta,
      dettagli: { tipo: prima.tipo, importo: prima.importo, ore: prima.ore, fatturaId: prima.fattura?.id },
    })
    return NextResponse.json({ ok: true, costi, totaleCosti: totale, totaleIncompleto: incompleto })
  } catch (e: any) {
    console.error(`[DELETE /api/manutenzioni/${id}/costi/${costoId}]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
