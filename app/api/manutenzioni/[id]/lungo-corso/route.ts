/**
 * PATCH /api/manutenzioni/[id]/lungo-corso — { lungoCorso, previsione? }
 *
 * Sposta la richiesta dentro o fuori la sezione "Lungo corso" del Pannello.
 * Nessuna mail: per avvisare il richiedente c'è la conversazione.
 * Solo gestione (isAdmin).
 */

import { NextRequest, NextResponse } from 'next/server'
import { accessoPratica } from '@/lib/manutenzioni/accesso'
import { aggiornaRichiesta } from '@/lib/manutenzioni/data'
import { pulisciTesto } from '@/lib/manutenzioni/pratica'
import { logAzione } from '@/lib/core/audit'
import type { LungoCorsoPayload } from '@/types/manutenzioni'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: LungoCorsoPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  if (typeof body.lungoCorso !== 'boolean') {
    return NextResponse.json({ error: 'Valore non valido' }, { status: 400 })
  }
  const a = await accessoPratica(id, 'gestione')
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })

  const previsione = body.lungoCorso ? pulisciTesto(body.previsione).slice(0, 255) : ''
  try {
    // La previsione si svuota quando si toglie la spunta: una data vecchia
    // rimasta lì tornerebbe fuori la prossima volta come se fosse attuale.
    await aggiornaRichiesta(id, { LungoCorso: body.lungoCorso, PrevisioneLungoCorso: previsione || null })
    await logAzione({
      utente: a.email,
      nome: a.nome,
      azione: 'manutenzione.lungo-corso',
      entita: 'RichiestaManutenzione',
      entitaId: a.richiesta.idRichiesta,
      dettagli: { lungoCorso: body.lungoCorso, previsione: previsione || undefined },
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error(`[PATCH /api/manutenzioni/${id}/lungo-corso]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
