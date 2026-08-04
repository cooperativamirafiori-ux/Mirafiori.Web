/**
 * POST /api/timbrature/hr/forza   body: { dipendenteId, anno, mese }
 *
 * Chiusura d'ufficio quando la conferma del dipendente non arriva mai.
 * Resta registrato che l'ok e' presunto e non dato: nei controlli la differenza
 * conta, e chi guarda il foglio deve poterla vedere.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardValidatore, puoAgireSu } from '@/lib/timbrature-guard'
import { confermaFoglio } from '@/lib/timbrature-flusso'
import { logAzione } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const g = await guardValidatore()
  if (g.error) return g.error
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const dipendenteId = Number(body?.dipendenteId)
  const anno = Number(body?.anno)
  const mese = Number(body?.mese)
  if (!dipendenteId || !anno || !mese) {
    return NextResponse.json({ error: 'dipendenteId, anno, mese obbligatori' }, { status: 400 })
  }
  const negato = await puoAgireSu(g.v, dipendenteId)
  if (negato) return NextResponse.json({ error: negato }, { status: 403 })

  try {
    const esito = await confermaFoglio(dipendenteId, anno, mese, g.v.email, { forzato: true })
    if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: 400 })
    await logAzione({
      utente: g.v.email,
      nome: g.v.session.user.name,
      azione: 'timbrature.conferma-forzata',
      entita: 'FoglioOre',
      entitaId: `${dipendenteId}/${anno}-${mese}`,
    })
    return NextResponse.json({ chiusura: esito.chiusura })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
