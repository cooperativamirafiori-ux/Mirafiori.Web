/**
 * POST /api/manutenzioni/[id]/voci — { come, testo }
 *
 * Aggiunge una riga alle "cose da fare" della richiesta. Possono farlo la
 * gestione e il richiedente (decisione di Dennis, 31 ott 2026); spuntarla o
 * toglierla solo la gestione (voci/[voceId]). Su una richiesta completata non
 * si aggiunge più niente.
 */

import { NextRequest, NextResponse } from 'next/server'
import { accessoPratica } from '@/lib/manutenzioni/accesso'
import { aggiungiVoce, pulisciTesto } from '@/lib/manutenzioni/pratica'
import { logAzione } from '@/lib/core/audit'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: { come?: unknown; testo?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const a = await accessoPratica(id, body.come)
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  if (a.richiesta.stato === 'Completata') {
    return NextResponse.json({ error: 'Richiesta già completata' }, { status: 409 })
  }

  const testo = pulisciTesto(body.testo).slice(0, 300)
  if (!testo) return NextResponse.json({ error: 'Scrivi cosa c\'è da fare' }, { status: 400 })

  try {
    const voce = await aggiungiVoce({ richiesta: a.richiesta, testo, lato: a.lato, email: a.email })
    await logAzione({
      utente: a.email,
      nome: a.nome,
      azione: 'manutenzione.voce-aggiunta',
      entita: 'RichiestaManutenzione',
      entitaId: a.richiesta.idRichiesta,
      dettagli: { lato: a.lato, testo },
    })
    return NextResponse.json({ ok: true, voce })
  } catch (e: any) {
    console.error(`[POST /api/manutenzioni/${id}/voci]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
