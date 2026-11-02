/**
 * POST /api/manutenzioni/[id]/costi — aggiunge un costo alla richiesta.
 *
 * { tipo: 'fattura', fatturaId, importo? }           importo assente = tutto il disponibile
 * { tipo: 'ore', ore, data, figura?, descrizione? }   importo = ore × tariffa del mese
 * { tipo: 'spesa', importo, data, descrizione, fornitore? }
 *
 * Solo gestione (isAdmin). Si possono aggiungere anche a richiesta completata:
 * le fatture arrivano spesso dopo. Risponde con i costi aggiornati.
 */

import { NextRequest, NextResponse } from 'next/server'
import { accessoPratica } from '@/lib/manutenzioni/accesso'
import { aggiungiCosto, leggiCosti, totaleDi } from '@/lib/manutenzioni/costi'
import { ribaltaManutenzione } from '@/lib/manutenzioni/ribaltamento'
import { logAzione } from '@/lib/core/audit'
import type { NuovoCostoPratica } from '@/types/manutenzioni'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: NuovoCostoPratica
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const a = await accessoPratica(id, 'gestione')
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })

  let mese: string
  try {
    mese = await aggiungiCosto(a.richiesta, body, a.email)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Costo non salvato' }, { status: 400 })
  }

  // Ribaltamento sulla struttura: se non riesce il costo resta salvato, e il giro
  // notturno (cron/ribaltamento) riallinea l'addebito. Lo si dice, non si blocca.
  let avviso: string | null = null
  try {
    avviso = await ribaltaManutenzione(id, mese, a.email)
  } catch (e: any) {
    console.error(`[POST /api/manutenzioni/${id}/costi] ribaltamento`, e)
    avviso = `Costo salvato, ma l'addebito alla struttura non si è aggiornato (${e.message ?? 'errore'}). Si riallinea stanotte.`
  }

  try {
    const costi = await leggiCosti(id)
    const { totale, incompleto } = totaleDi(costi)
    await logAzione({
      utente: a.email,
      nome: a.nome,
      azione: 'manutenzione.costo-aggiunto',
      entita: 'RichiestaManutenzione',
      entitaId: a.richiesta.idRichiesta,
      dettagli: { tipo: body.tipo, importo: body.importo, ore: body.ore, fatturaId: body.fatturaId },
    })
    return NextResponse.json({ ok: true, costi, totaleCosti: totale, totaleIncompleto: incompleto, avviso })
  } catch (e: any) {
    console.error(`[POST /api/manutenzioni/${id}/costi]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
