/**
 * PATCH /api/assistente/[id] — { utile: boolean }: il "ti è stata utile?" sotto una risposta.
 * Il registro è anonimo, quindi chiunque sia entrato nell'app può segnarlo.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { segnaUtile } from '@/lib/assistente/registro'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  const { id } = await params
  const n = Number(id)
  const body = await req.json().catch(() => null)
  if (!Number.isInteger(n) || n <= 0 || typeof body?.utile !== 'boolean') {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  try {
    await segnaUtile(n, body.utile)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
