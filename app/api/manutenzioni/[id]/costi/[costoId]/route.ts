/**
 * DELETE /api/manutenzioni/[id]/costi/[costoId] — toglie un costo dalla richiesta.
 *
 * Una fattura tolta torna disponibile da collegare e resta su cc24. Solo gestione.
 */

import { NextRequest, NextResponse } from 'next/server'
import { accessoPratica } from '@/lib/manutenzioni/accesso'
import { eliminaCosto, leggiCosti, totaleDi } from '@/lib/manutenzioni/costi'
import { ribaltaManutenzione } from '@/lib/manutenzioni/ribaltamento'
import { logAzione } from '@/lib/core/audit'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; costoId: string }> }) {
  const { id, costoId } = await params
  const a = await accessoPratica(id, 'gestione')
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })

  try {
    const prima = (await leggiCosti(id)).find((c) => c.id === costoId)
    let mese: string | null | false = false
    try {
      mese = prima ? await eliminaCosto(id, costoId) : false
    } catch (e: any) {
      if (String(e.message).startsWith('MESE_CHIUSO: ')) {
        return NextResponse.json({ error: 'Non si può togliere: ' + String(e.message).slice(13) }, { status: 409 })
      }
      throw e
    }
    if (!prima || !mese) {
      return NextResponse.json({ error: 'Costo non trovato' }, { status: 404 })
    }
    let avviso: string | null = null
    try {
      avviso = await ribaltaManutenzione(id, mese, a.email)
    } catch (e: any) {
      console.error(`[DELETE /api/manutenzioni/${id}/costi/${costoId}] ribaltamento`, e)
      avviso = `Costo tolto, ma l'addebito alla struttura non si è aggiornato (${e.message ?? 'errore'}). Si riallinea stanotte.`
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
    return NextResponse.json({ ok: true, costi, totaleCosti: totale, totaleIncompleto: incompleto, avviso })
  } catch (e: any) {
    console.error(`[DELETE /api/manutenzioni/${id}/costi/${costoId}]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
