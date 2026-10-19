/**
 * Tariffario dei preventivi.
 *
 *   GET          → { tariffe } — lo vedono tutti quelli che fanno preventivi
 *   POST {voce}  → nuova voce (solo chi ha "Amministrazione")
 *
 * Regole (il passato non cambia): lib/preventivi/tariffario.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPreventivi, leggiCorpo, rispostaErrore } from '@/lib/preventivi/guard'
import { getTariffe } from '@/lib/preventivi/data'
import { leggiTariffa, nuovaVoce } from '@/lib/preventivi/tariffario'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardPreventivi()
  if (g.error) return g.error
  try {
    return NextResponse.json({ tariffe: await getTariffe(), accesso: g.accesso })
  } catch (e) {
    return rispostaErrore(e, 500)
  }
}

export async function POST(req: NextRequest) {
  const g = await guardPreventivi({ soloTutti: true })
  if (g.error) return g.error
  const b = await leggiCorpo(req)
  if (!b) return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  const letto = leggiTariffa(b)
  if ('problemi' in letto) return NextResponse.json({ error: letto.problemi.join(' · ') }, { status: 400 })
  try {
    const tariffa = await nuovaVoce(letto.dati)
    await logAzione({
      utente: g.email,
      nome: g.nome,
      azione: 'preventivi.tariffa_nuova',
      entita: 'TariffaPreventivi',
      entitaId: tariffa.spItemId,
      dettagli: { codice: tariffa.codice, prezzo: tariffa.prezzo, dal: tariffa.dal },
    })
    return NextResponse.json({ tariffa })
  } catch (e) {
    return rispostaErrore(e)
  }
}
