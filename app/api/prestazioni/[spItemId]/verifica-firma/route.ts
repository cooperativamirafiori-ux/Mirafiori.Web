/**
 * POST /api/prestazioni/[spItemId]/verifica-firma
 * Controlla su DocuSign se la busta è stata firmata; in caso affermativo
 * scarica i documenti firmati nella cartella SharePoint e porta lo stato a
 * "Contratto firmato".
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { verificaFirmaById } from '@/lib/firma-prestazione'

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
    const esito = await verificaFirmaById(spItemId)
    return NextResponse.json(esito, { status: 200 })
  } catch (err: any) {
    console.error('[POST /api/prestazioni/[spItemId]/verifica-firma]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
