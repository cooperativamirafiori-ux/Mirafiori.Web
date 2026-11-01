/**
 * POST /api/manutenzioni/assistente — una domanda all'assistente delle manutenzioni.
 * Corpo: { domanda, storia: [{ ruolo: 'utente'|'assistente', testo }] }
 * Risposta: { testo, azioni } — `azioni` sono proposte: le esegue il browser,
 * alla conferma, chiamando le API del Pannello (che ricontrollano tutto).
 *
 * Solo admin delle manutenzioni. Logica in lib/manutenzioni/assistente.ts,
 * decisioni in docs/assistente-manutenzioni.md.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import {
  chiediAssistenteManutenzioni,
  assistenteManutenzioniConfigurato,
  MAX_DOMANDA,
} from '@/lib/manutenzioni/assistente'
import type { MessaggioAssistenteManutenzioni } from '@/types/manutenzioni'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  if (!session.user.isAdmin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  if (!assistenteManutenzioniConfigurato()) {
    return NextResponse.json({ error: "L'assistente non è ancora attivo." }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  const domanda = typeof body?.domanda === 'string' ? body.domanda.trim() : ''
  if (!domanda) return NextResponse.json({ error: 'Scrivi una domanda.' }, { status: 400 })
  if (domanda.length > MAX_DOMANDA) {
    return NextResponse.json({ error: `Troppo lunga (massimo ${MAX_DOMANDA} caratteri).` }, { status: 400 })
  }
  const storia: MessaggioAssistenteManutenzioni[] = Array.isArray(body?.storia)
    ? body.storia
        .filter((m: any) => (m?.ruolo === 'utente' || m?.ruolo === 'assistente') && typeof m?.testo === 'string')
        .map((m: any) => ({ ruolo: m.ruolo, testo: m.testo }))
    : []

  try {
    const r = await chiediAssistenteManutenzioni({ domanda, storia, nome: session.user.name ?? '' })
    return NextResponse.json(r)
  } catch (e) {
    console.error('[POST /api/manutenzioni/assistente]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 502 })
  }
}
