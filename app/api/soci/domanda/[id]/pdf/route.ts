/**
 * GET /api/soci/domanda/[id]/pdf — il modulo compilato, da stampare e firmare.
 * Si rigenera a ogni richiesta dai dati salvati: non si archivia nulla.
 */

import { NextResponse } from 'next/server'
import { graphSoci } from '@/lib/soci/data'
import { pdfDomanda } from '@/lib/soci/documento'
import { oggiIso } from '@/lib/soci/flusso'
import { errore, guardDomanda } from '@/lib/soci/guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g0 = await guardDomanda(id)
  if (g0.risposta) return g0.risposta
  const d = g0.domanda

  try {
    const pdf = await pdfDomanda(graphSoci(), d.spItemId, d.dati, d.dataDomanda ?? oggiIso())
    const nome = `Domanda ammissione socio - ${d.dati.cognome} ${d.dati.nome}.pdf`.replace(/[^\p{L}\p{N} ._-]/gu, '')
    const body = new Uint8Array(pdf)
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nome}"`,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    console.error(`[GET /api/soci/domanda/${id}/pdf]`, e)
    return errore('Non sono riuscito a preparare il PDF: riprova fra poco.', 500)
  }
}
