/**
 * GET → il PDF del preventivo com'è adesso (una bozza esce con la scritta
 * "BOZZA — non valida" al posto del protocollo). Conversione via Graph:
 * lib/preventivi/documento.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPreventivi, rispostaErrore } from '@/lib/preventivi/guard'
import { preventivoPer } from '@/lib/preventivi/azioni'
import { nomeFile, pdfPreventivo } from '@/lib/preventivi/documento'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardPreventivi()
  if (g.error) return g.error
  const { id } = await params
  try {
    const p = await preventivoPer(id, g.accesso)
    const pdf = await pdfPreventivo(p)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nomeFile(p, 'pdf')}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return rispostaErrore(e, 500)
  }
}
