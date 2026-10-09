/**
 * POST /api/utenze — nuova riga della Mappatura Utenze, e collegamento delle
 * bollette già arrivate con quel codice. Solo permesso "Amministrazione".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { collegaCodice, creaUtenza } from '@/lib/utenze/data'
import { AREA_AMMINISTRAZIONE, leggiDatiMappatura } from '@/types/utenze'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await guardArea(AREA_AMMINISTRAZIONE)
  if (g.error) return g.error
  const r = leggiDatiMappatura(await req.json().catch(() => ({})))
  if ('problemi' in r) return NextResponse.json({ error: r.problemi.join('. ') }, { status: 400 })
  try {
    const id = await creaUtenza(r.dati)
    const collegate = await collegaCodice(r.dati.codice, g.session.user.email!)
    await logAzione({ utente: g.session.user.email, azione: 'utenze.crea', entita: 'Utenza', entitaId: id, dettagli: { ...r.dati, collegate } })
    return NextResponse.json({ id, collegate })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
