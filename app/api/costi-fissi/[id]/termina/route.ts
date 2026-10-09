/**
 * POST /api/costi-fissi/[id]/termina — il costo viene a mancare: vale fino
 * all'ultimo giorno indicato, i mesi in cui c'era restano. Solo "Amministrazione".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { terminaCostoFisso } from '@/lib/costi-fissi/data'
import { dataValida } from '@/types/costi-fissi'
import { AREA_AMMINISTRAZIONE } from '@/types/utenze'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardArea(AREA_AMMINISTRAZIONE)
  if (g.error) return g.error
  const id = Number((await params).id)
  const body = await req.json().catch(() => ({}))
  if (!id || !dataValida(body.ultimoGiorno)) return NextResponse.json({ error: "Indica l'ultimo giorno in cui il costo vale" }, { status: 400 })
  try {
    await terminaCostoFisso(id, body.ultimoGiorno)
    await logAzione({ utente: g.session.user.email, azione: 'costi-fissi.termina', entita: 'CostoFisso', entitaId: id, dettagli: { ultimoGiorno: body.ultimoGiorno } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 400 })
  }
}
