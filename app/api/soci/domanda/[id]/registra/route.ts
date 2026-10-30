/**
 * POST /api/soci/domanda/[id]/registra — riprova la registrazione.
 *
 * Serve solo se il caricamento della domanda firmata è andato a buon fine ma
 * un passo successivo no (SharePoint lento, mail non partita…). Riusa il
 * numero già assegnato: vedi lib/soci/flusso.ts.
 */

import { NextResponse } from 'next/server'
import { graphSoci } from '@/lib/soci/data'
import { registraSocio } from '@/lib/soci/flusso'
import { errore, guardDomanda } from '@/lib/soci/guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g0 = await guardDomanda(id)
  if (g0.risposta) return g0.risposta
  const { session, domanda } = g0
  if (domanda.stato === 'In attesa di firma') return errore('Prima carica la domanda firmata.', 409)

  try {
    const esito = await registraSocio(graphSoci(), domanda, { email: session.user.email!, nome: session.user.name })
    return NextResponse.json({ numero: esito.numero, stato: 'Registrata' })
  } catch (e: any) {
    console.error(`[POST /api/soci/domanda/${id}/registra]`, e)
    return errore(`Registrazione non riuscita: ${e?.message ?? 'errore interno'}`, 500, { firmata: true })
  }
}
