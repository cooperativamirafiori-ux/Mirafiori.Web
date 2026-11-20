/**
 * GET → quello che serve al modulo: il tariffario (storico compreso: la
 * schermata sceglie la riga valida alla data del periodo), gli enti, i centri
 * di costo su cui si può fare un preventivo, la rubrica dei contatti e chi
 * sta scrivendo (è il primo referente dei preventivi ai privati).
 */

import { NextResponse } from 'next/server'
import { guardPreventivi, rispostaErrore } from '@/lib/preventivi/guard'
import { getContatti, getEnti, getTariffe } from '@/lib/preventivi/data'
import { getCentriDiCosto } from '@/lib/centri-costo/data'
import { vedeCentro } from '@/lib/preventivi/accesso'

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardPreventivi()
  if (g.error) return g.error
  try {
    const [tariffe, enti, centri, contatti] = await Promise.all([getTariffe(), getEnti(), getCentriDiCosto(), getContatti()])
    return NextResponse.json({
      tariffe,
      enti,
      centri: centri
        .filter((c) => c.codice && vedeCentro(g.accesso, c.codice))
        .map((c) => ({ codice: c.codice.toLowerCase(), nome: c.nome, area: c.area })),
      contatti,
      accesso: g.accesso,
      io: { email: g.email, nome: g.nome },
    })
  } catch (e) {
    return rispostaErrore(e, 500)
  }
}
