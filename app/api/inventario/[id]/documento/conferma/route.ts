/**
 * POST /api/inventario/[id]/documento/conferma
 *
 * Registra sulla riga del bene il documento che il browser ha già caricato
 * direttamente su SharePoint (ne legge il webUrl) e scrive nel log.
 *
 * Body JSON: { nomeFile: string, tipo: 'fattura' | 'garanzia' }
 * Risposta:  { bene }
 *
 * Protetta: area "Acquisti".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/api-guard'
import { AREA_ACQUISTI } from '@/lib/acquisti'
import { confermaDocumento, getBeneById, inventarioConfigurato } from '@/lib/inventario'
import { logAzione } from '@/lib/audit'
import { TIPI_DOCUMENTO, type TipoDocumento } from '@/types/inventario'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA_ACQUISTI)
  if (g.error) return g.error

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID bene mancante' }, { status: 400 })
  if (!inventarioConfigurato()) {
    return NextResponse.json({ error: 'Inventario non configurato' }, { status: 503 })
  }

  let nomeFile = ''
  let tipo: TipoDocumento | undefined
  try {
    const body = await req.json()
    nomeFile = typeof body?.nomeFile === 'string' ? body.nomeFile.trim() : ''
    tipo = body?.tipo
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso JSON)' }, { status: 400 })
  }
  if (!nomeFile) return NextResponse.json({ error: 'Nome file mancante' }, { status: 400 })
  if (!tipo || !TIPI_DOCUMENTO.includes(tipo)) {
    return NextResponse.json({ error: 'Tipo documento non valido' }, { status: 400 })
  }

  try {
    const bene = await confermaDocumento(await getBeneById(id), tipo, nomeFile)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: `inventario.carica-${tipo}`,
      entita: 'BeneInventario',
      entitaId: bene.numero,
      dettagli: { file: nomeFile, richiesta: bene.codiceRichiesta },
    })
    return NextResponse.json({ bene })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore conferma caricamento' },
      { status: 500 },
    )
  }
}
