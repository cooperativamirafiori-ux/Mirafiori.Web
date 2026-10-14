/**
 * Una ricorrenza di Cura Ambienti.
 *
 *   PATCH { stato: 'attiva' | 'pausa' | 'chiusa' } → pausa, ripresa, chiusura
 *
 * Vale per i mesi che verranno: i lavori già creati non si toccano.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardCuraAmbienti } from '@/lib/cura-ambienti/guard'
import { cambiaStatoRicorrenza } from '@/lib/cura-ambienti/data'
import { STATI_RICORRENZA, type StatoRicorrenza } from '@/types/cura-ambienti'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCuraAmbienti()
  if (g.error) return g.error
  const { id } = await params
  let b: { stato?: unknown }
  try {
    b = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  if (typeof b.stato !== 'string' || !(b.stato in STATI_RICORRENZA)) {
    return NextResponse.json({ error: 'Stato non valido' }, { status: 400 })
  }
  try {
    const ricorrenza = await cambiaStatoRicorrenza(id, b.stato as StatoRicorrenza, g.email)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'cura_ambienti.stato_ricorrenza',
      entita: 'RicorrenzaCuraAmbienti',
      entitaId: id,
      dettagli: { titolo: ricorrenza.titolo, stato: ricorrenza.stato },
    })
    return NextResponse.json({ ricorrenza })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Operazione non riuscita' }, { status: 400 })
  }
}
