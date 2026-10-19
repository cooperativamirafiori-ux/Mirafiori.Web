/**
 * GET → quello che serve al modulo: il tariffario (storico compreso: la
 * schermata sceglie la riga valida alla data del periodo), i centri di costo
 * su cui si può fare un preventivo, la rubrica dei contatti.
 */

import { NextResponse } from 'next/server'
import { guardPreventivi, rispostaErrore } from '@/lib/preventivi/guard'
import { getContatti, getTariffe } from '@/lib/preventivi/data'
import { getCentriDiCosto } from '@/lib/centri-costo/data'
import { vedeCentro } from '@/lib/preventivi/accesso'

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardPreventivi()
  if (g.error) return g.error
  try {
    const [tariffe, centri, contatti] = await Promise.all([getTariffe(), getCentriDiCosto(), getContatti()])
    return NextResponse.json({
      tariffe,
      centri: centri
        .filter((c) => c.codice && vedeCentro(g.accesso, c.codice))
        .map((c) => ({ codice: c.codice.toLowerCase(), nome: c.nome, area: c.area })),
      contatti,
      accesso: g.accesso,
    })
  } catch (e) {
    return rispostaErrore(e, 500)
  }
}
