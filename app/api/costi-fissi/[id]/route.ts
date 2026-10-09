/** PATCH /api/costi-fissi/[id] — CORREZIONE di un errore: riscrive la voce, passato compreso. Solo "Amministrazione". */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { correggiCostoFisso } from '@/lib/costi-fissi/data'
import { leggiDatiCostoFisso } from '@/types/costi-fissi'
import { AREA_AMMINISTRAZIONE } from '@/types/utenze'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardArea(AREA_AMMINISTRAZIONE)
  if (g.error) return g.error
  const id = Number((await params).id)
  const r = leggiDatiCostoFisso(await req.json().catch(() => ({})))
  if (!id || 'problemi' in r) return NextResponse.json({ error: 'problemi' in r ? r.problemi.join('. ') : 'id mancante' }, { status: 400 })
  try {
    await correggiCostoFisso(id, r.dati)
    await logAzione({ utente: g.session.user.email, azione: 'costi-fissi.correggi', entita: 'CostoFisso', entitaId: id, dettagli: r.dati })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
