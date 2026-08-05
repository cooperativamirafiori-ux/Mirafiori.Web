/**
 * GET  /api/risorse-umane/dipendenti/[id]/cartella  — URL cartella + elenco documenti
 * POST /api/risorse-umane/dipendenti/[id]/cartella  — crea (se manca) la cartella personale
 *
 * Accesso: membri del gruppo Microsoft 365 "Risorse Umane" (vedi lib/gruppo-ru.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardMembroRU } from '@/lib/core/api-guard'
import { graphRU } from '@/lib/core/graph-delegato'
import { logAzione } from '@/lib/core/audit'
import {
  ensureCartellaDipendente,
  getDocumentiDipendente,
  getItem,
} from '@/lib/risorse-umane'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMembroRU()
  if (g.error) return g.error
  const { id } = await params
  try {
    const gc = await graphRU(g.session.user.email)
    const dip = await getItem(gc, 'dipendenti', id)
    const documenti = await getDocumentiDipendente(gc, id)
    return NextResponse.json({ url: dip.CartellaUrl ?? null, documenti })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore lettura cartella' },
      { status: 500 },
    )
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMembroRU()
  if (g.error) return g.error
  const { id } = await params
  try {
    const gc = await graphRU(g.session.user.email)
    const res = await ensureCartellaDipendente(gc, id)
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
