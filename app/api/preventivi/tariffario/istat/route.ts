/**
 * Adeguamento ISTAT del tariffario (solo chi ha "Amministrazione").
 *
 *   POST { percentuale, dal, ids?, applica: false } → anteprima: voce per voce prima/dopo
 *   POST { percentuale, dal, ids, applica: true }   → chiude le righe in vigore il
 *        giorno prima di `dal` e apre quelle nuove (il passato non cambia)
 *
 * Il rimborso chilometrico resta fuori.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPreventivi, leggiCorpo, rispostaErrore } from '@/lib/preventivi/guard'
import { istatAnteprima, istatApplica } from '@/lib/preventivi/tariffario'
import { isoValida } from '@/lib/preventivi/calcoli'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const g = await guardPreventivi({ soloTutti: true })
  if (g.error) return g.error
  const b = await leggiCorpo(req)
  const percentuale = Number(String(b?.percentuale ?? '').replace(',', '.'))
  const dal = String(b?.dal ?? '')
  if (!(percentuale > 0 && percentuale < 50)) return NextResponse.json({ error: 'Scrivi la percentuale ISTAT (es. 1,6)' }, { status: 400 })
  if (!isoValida(dal)) return NextResponse.json({ error: 'Scegli da quando vale' }, { status: 400 })
  const ids = Array.isArray(b?.ids) ? b!.ids.map(String) : undefined
  try {
    if (!b?.applica) return NextResponse.json({ voci: await istatAnteprima(percentuale, dal, ids) })
    if (!ids?.length) return NextResponse.json({ error: 'Nessuna voce scelta' }, { status: 400 })
    const esito = await istatApplica(percentuale, dal, ids)
    await logAzione({
      utente: g.email,
      nome: g.nome,
      azione: 'preventivi.istat',
      entita: 'TariffaPreventivi',
      dettagli: { percentuale, dal, aggiornate: esito.aggiornate, saltate: esito.saltate.length },
    })
    return NextResponse.json(esito)
  } catch (e) {
    return rispostaErrore(e)
  }
}
