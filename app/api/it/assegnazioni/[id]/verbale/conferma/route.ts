/**
 * POST /api/it/assegnazioni/[id]/verbale/conferma — registra sull'assegnazione
 * il verbale firmato che il browser ha appena caricato su SharePoint.
 *
 * Body JSON: { genere: 'bene' | 'sim', tipo: 'consegna' | 'restituzione', nomeFile }
 *
 * Protetta: area "IT e Dispositivi".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { registraVerbale } from '@/lib/it/assegnazioni'
import { trovaVerbale } from '@/lib/it/verbali'
import { AREA_IT, TIPI_VERBALE, type GenereAssegnazione, type TipoVerbale } from '@/types/it'

export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA_IT)
  if (g.error) return g.error

  const { id } = await params
  if (!id) return err('ID assegnazione mancante')

  let body: { genere?: string; tipo?: string; nomeFile?: string }
  try {
    body = await req.json()
  } catch {
    return err('Body non valido (atteso JSON)')
  }

  const genere = body.genere as GenereAssegnazione
  if (genere !== 'bene' && genere !== 'sim') return err('Genere non valido.')
  const tipo = body.tipo as TipoVerbale
  if (!TIPI_VERBALE.includes(tipo)) return err('Tipo di verbale non valido.')
  const nomeFile = (body.nomeFile ?? '').trim()
  if (!nomeFile) return err('Nome file mancante')

  try {
    const file = await trovaVerbale(tipo, nomeFile)
    const a = await registraVerbale(genere, id, tipo, file)

    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: `it.verbale-${tipo}`,
      entita: genere === 'bene' ? 'Dispositivo' : 'Sim',
      entitaId: a.oggettoEtichetta || id,
      dettagli: { file: file.nome },
    })

    return NextResponse.json({ assegnazione: a })
  } catch (e) {
    console.error(`[POST /api/it/assegnazioni/${id}/verbale/conferma]`, e)
    return err(e instanceof Error ? e.message : 'Errore interno', 500)
  }
}
