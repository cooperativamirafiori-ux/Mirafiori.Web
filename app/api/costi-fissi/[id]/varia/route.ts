/**
 * POST /api/costi-fissi/[id]/varia — il costo cambia da un mese in poi
 * (es. aumento dell'affitto): la voce vecchia si chiude alla fine del mese
 * prima, ne nasce una nuova. Il passato resta com'era. Solo "Amministrazione".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { variaCostoFisso } from '@/lib/costi-fissi/data'
import { dataValida, leggiDatiCostoFisso } from '@/types/costi-fissi'
import { AREA_AMMINISTRAZIONE } from '@/types/utenze'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardArea(AREA_AMMINISTRAZIONE)
  if (g.error) return g.error
  const id = Number((await params).id)
  const body = await req.json().catch(() => ({}))
  if (!dataValida(body.dal)) return NextResponse.json({ error: 'Indica da quale mese vale la variazione' }, { status: 400 })
  const r = leggiDatiCostoFisso(body)
  if (!id || 'problemi' in r) return NextResponse.json({ error: 'problemi' in r ? r.problemi.join('. ') : 'id mancante' }, { status: 400 })
  try {
    const nuovo = await variaCostoFisso(id, r.dati, body.dal)
    await logAzione({ utente: g.session.user.email, azione: 'costi-fissi.varia', entita: 'CostoFisso', entitaId: id, dettagli: { ...r.dati, dal: body.dal, nuovo } })
    return NextResponse.json({ ok: true, nuovo })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 400 })
  }
}
