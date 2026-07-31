/**
 * POST /api/software/[id]/fattura/conferma
 *
 * Registra sulla riga SP la fattura che il browser ha già caricato direttamente
 * su SharePoint (legge il webUrl del file) e scrive nel log.
 *
 * Body JSON: { nomeFile: string }
 * Risposta:  { software }
 *
 * Protetta: solo chi ha il permesso "Amministrazione".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/api-guard'
import { confermaFattura } from '@/lib/software'
import { logAzione } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA)
  if (g.error) return g.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })

  let nomeFile = ''
  try {
    const body = await req.json()
    nomeFile = typeof body?.nomeFile === 'string' ? body.nomeFile.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso JSON)' }, { status: 400 })
  }
  if (!nomeFile) {
    return NextResponse.json({ error: 'Nome file mancante' }, { status: 400 })
  }

  try {
    const software = await confermaFattura(id, nomeFile)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'software.carica-fattura',
      entita: 'Software',
      entitaId: id,
      dettagli: { file: nomeFile },
    })
    return NextResponse.json({ software })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore conferma fattura' },
      { status: 500 },
    )
  }
}
