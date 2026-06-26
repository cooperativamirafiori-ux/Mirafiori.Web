/**
 * POST /api/prestazioni/[spItemId]/chiudi
 * Il responsabile segna la pratica come "Chiusa".
 * Consentito SOLO dopo che la notula è stata caricata dal prestatore
 * (stato corrente "Notula ricevuta").
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getPrestazioneById, aggiornaPrestazione } from '@/lib/prestazioni'

export const runtime = 'nodejs'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> },
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const { spItemId } = await params

  try {
    const prestazione = await getPrestazioneById(spItemId)

    if (prestazione.stato === 'Chiusa') {
      return NextResponse.json({ ok: true, stato: 'Chiusa' }, { status: 200 })
    }
    if (prestazione.stato !== 'Notula ricevuta') {
      return NextResponse.json(
        {
          error:
            'La pratica può essere chiusa solo dopo che il prestatore ha caricato la notula.',
        },
        { status: 409 },
      )
    }

    await aggiornaPrestazione(spItemId, { Stato: 'Chiusa' })
    return NextResponse.json({ ok: true, stato: 'Chiusa' }, { status: 200 })
  } catch (err: any) {
    console.error('[POST /api/prestazioni/[spItemId]/chiudi]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
