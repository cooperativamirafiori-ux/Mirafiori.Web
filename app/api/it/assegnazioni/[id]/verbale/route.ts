/**
 * POST /api/it/assegnazioni/[id]/verbale — apre la sessione di upload del
 * verbale firmato (consegna o restituzione).
 *
 * Body JSON: { genere: 'bene' | 'sim', tipo: 'consegna' | 'restituzione',
 *              filename, dimensione? }
 * Risposta:  { uploadUrl, scadeIl, nomeFile }
 *
 * Il browser fa poi il PUT diretto a SharePoint e chiama
 * POST /api/it/assegnazioni/[id]/verbale/conferma. I byte non passano da Vercel.
 *
 * Il file va in "Verbali Consegna" o "Verbali Restituzione", col numero di
 * inventario nel nome: vedi lib/it/verbali.ts.
 *
 * Protetta: area "IT e Dispositivi".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/core/upload-diretto'
import { getAssegnazioneById } from '@/lib/it/assegnazioni'
import { creaSessioneVerbale } from '@/lib/it/verbali'
import { AREA_IT, TIPI_VERBALE, type GenereAssegnazione, type TipoVerbale } from '@/types/it'

export const runtime = 'nodejs'
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

  let body: { genere?: string; tipo?: string; filename?: string; dimensione?: number }
  try {
    body = await req.json()
  } catch {
    return err('Body non valido (atteso JSON)')
  }

  const genere = body.genere as GenereAssegnazione
  if (genere !== 'bene' && genere !== 'sim') return err('Genere non valido.')

  const tipo = body.tipo as TipoVerbale
  if (!TIPI_VERBALE.includes(tipo)) return err('Tipo di verbale non valido.')

  const filename = (body.filename ?? '').trim()
  if (!filename) return err('Nome file mancante')
  if (typeof body.dimensione === 'number' && body.dimensione > MAX_UPLOAD_BYTES) {
    return err(`File troppo grande (max ${maxUploadMb()} MB)`, 413)
  }

  try {
    const a = await getAssegnazioneById(genere, id)
    if (tipo === 'restituzione' && a.stato !== 'Chiusa') {
      return err('Il verbale di restituzione si carica dopo aver chiuso l’assegnazione.', 409)
    }
    return NextResponse.json(await creaSessioneVerbale(a, tipo, filename))
  } catch (e) {
    console.error(`[POST /api/it/assegnazioni/${id}/verbale]`, e)
    return err(e instanceof Error ? e.message : 'Errore apertura caricamento', 500)
  }
}
