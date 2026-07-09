/**
 * GET  /api/risorse-umane/dipendenti/[id]/cartella  — URL cartella + elenco documenti
 * POST /api/risorse-umane/dipendenti/[id]/cartella  — crea (se manca) la cartella personale
 *
 * Protette dal permesso "Risorse Umane".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/api-guard'
import { AREA_RU } from '@/lib/ru-api'
import { logAzione } from '@/lib/audit'
import {
  ensureCartellaDipendente,
  getDocumentiDipendente,
  getItem,
} from '@/lib/risorse-umane'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardArea(AREA_RU)
  if (g.error) return g.error
  const { id } = await params
  try {
    const dip = await getItem('dipendenti', id)
    const documenti = await getDocumentiDipendente(id)
    return NextResponse.json({ url: dip.CartellaUrl ?? null, documenti })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore lettura cartella' },
      { status: 500 },
    )
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardArea(AREA_RU)
  if (g.error) return g.error
  const { id } = await params
  try {
    const res = await ensureCartellaDipendente(id)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'ru.dipendente.cartella-crea',
      entita: 'dipendente',
      entitaId: id,
    })
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore creazione cartella' },
      { status: 500 },
    )
  }
}
