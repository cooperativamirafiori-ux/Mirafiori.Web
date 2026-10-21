/**
 * PATCH /api/prestazioni/[spItemId]/centro-costo
 *
 * Assegna o cambia il centro di costo di una pratica (21 ott 2026): serve
 * soprattutto alle pratiche aperte prima che il campo esistesse.
 * Se la notula è già arrivata, riscrive subito la riga nel registro analitico.
 *
 * Body JSON: { centroCostoId: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { getPrestazioneById, aggiornaPrestazione } from '@/lib/prestazioni/data'
import { getCentriDiCosto } from '@/lib/centri-costo/data'
import { puoGestirePratica } from '@/lib/prestazioni/accesso'
import { riversaPrestazioneNelRegistro } from '@/lib/prestazioni/registro'
import { logAzione } from '@/lib/core/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> },
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  const { spItemId } = await params

  let centroCostoId = 0
  try {
    centroCostoId = Number((await req.json())?.centroCostoId)
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso JSON)' }, { status: 400 })
  }

  try {
    const cc = (await getCentriDiCosto()).find((c) => c.id === centroCostoId)
    if (!cc) return NextResponse.json({ error: 'Centro di costo non valido' }, { status: 400 })

    const p = await getPrestazioneById(spItemId)
    if (!puoGestirePratica(session.user, p)) {
      return NextResponse.json(
        { error: 'Può cambiarlo solo chi ha aperto la pratica o un amministratore.' },
        { status: 403 },
      )
    }
    if (p.stato === 'Annullata') {
      return NextResponse.json({ error: 'La pratica è annullata.' }, { status: 409 })
    }

    await aggiornaPrestazione(spItemId, { CentroCostoLookupId: cc.id })
    const nelRegistro = await riversaPrestazioneNelRegistro({ ...p, centroCostoId: cc.id, centroCosto: cc.nome })

    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: 'prestazione.centro-costo',
      entita: 'PrestazioneOccasionale',
      entitaId: p.idPrestazione,
      dettagli: { da: p.centroCosto ?? '(nessuno)', a: cc.nome, nelRegistro },
    })

    return NextResponse.json({ ok: true, centroCostoId: cc.id, centroCosto: cc.nome, nelRegistro })
  } catch (err: any) {
    console.error('[PATCH /api/prestazioni/[spItemId]/centro-costo]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
