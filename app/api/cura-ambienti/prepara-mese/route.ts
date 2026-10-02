/**
 * POST { mese } → copia nel mese i lavori ricorrenti del mese prima.
 * Ripetibile: i già copiati non si ricopiano.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardCuraAmbienti } from '@/lib/cura-ambienti/guard'
import { preparaMese } from '@/lib/cura-ambienti/data'
import { normalizzaMese } from '@/lib/cura-ambienti/flusso'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await guardCuraAmbienti()
  if (g.error) return g.error
  let b: { mese?: unknown }
  try {
    b = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const mese = normalizzaMese(b.mese)
  if (!mese) return NextResponse.json({ error: 'Mese non valido' }, { status: 400 })
  try {
    const r = await preparaMese(mese, g.email)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'cura_ambienti.prepara_mese',
      entita: 'LavoroCuraAmbienti',
      dettagli: { mese, ...r },
    })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Operazione non riuscita' }, { status: 400 })
  }
}
