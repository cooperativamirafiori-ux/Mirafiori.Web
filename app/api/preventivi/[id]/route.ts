/**
 * Un preventivo.
 *
 *   GET            → { preventivo }
 *   PATCH {dati}   → salva la bozza (solo in bozza)
 *   DELETE         → elimina una bozza mai emessa (senza protocollo)
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPreventivi, leggiCorpo, rispostaErrore } from '@/lib/preventivi/guard'
import { preventivoPer, salva } from '@/lib/preventivi/azioni'
import { eliminaPreventivo } from '@/lib/preventivi/data'
import { leggiDati } from '@/lib/preventivi/flusso'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const g = await guardPreventivi()
  if (g.error) return g.error
  const { id } = await params
  try {
    return NextResponse.json({ preventivo: await preventivoPer(id, g.accesso) })
  } catch (e) {
    return rispostaErrore(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await guardPreventivi()
  if (g.error) return g.error
  const { id } = await params
  const b = await leggiCorpo(req)
  if (!b) return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  const letto = leggiDati(b)
  if ('problemi' in letto) return NextResponse.json({ error: letto.problemi.join(' · ') }, { status: 400 })
  try {
    const preventivo = await salva(id, letto.dati, g.accesso)
    await logAzione({ utente: g.email, nome: g.nome, azione: 'preventivi.salva', entita: 'Preventivo', entitaId: id })
    return NextResponse.json({ preventivo })
  } catch (e) {
    return rispostaErrore(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const g = await guardPreventivi()
  if (g.error) return g.error
  const { id } = await params
  try {
    const p = await preventivoPer(id, g.accesso)
    if (p.stato !== 'bozza' || p.numero) {
      return NextResponse.json(
        { error: 'Ha già un numero di protocollo: non si elimina, si annulla' },
        { status: 400 },
      )
    }
    await eliminaPreventivo(id)
    await logAzione({ utente: g.email, nome: g.nome, azione: 'preventivi.elimina_bozza', entita: 'Preventivo', entitaId: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return rispostaErrore(e)
  }
}
