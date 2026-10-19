/**
 * Una voce del tariffario (solo chi ha "Amministrazione").
 *
 *   PATCH { tipo: 'modifica', voce, gruppo, note, modelli, ordine, bloccato }
 *         → correzione in place dei campi descrittivi
 *   PATCH { tipo: 'prezzo', prezzo, min, max, dal }
 *         → nuovo prezzo da una data: chiude la riga e ne apre una nuova
 *   PATCH { tipo: 'chiudi', al } → la voce non vale più dopo quella data
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPreventivi, leggiCorpo, rispostaErrore } from '@/lib/preventivi/guard'
import { aggiornaTariffa } from '@/lib/preventivi/data'
import { chiudiVoce, nuovoPrezzo } from '@/lib/preventivi/tariffario'
import { ELENCO_MODELLI, type Modello } from '@/types/preventivi'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardPreventivi({ soloTutti: true })
  if (g.error) return g.error
  const { id } = await params
  const b = await leggiCorpo(req)
  if (!b) return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  try {
    if (b.tipo === 'prezzo') {
      const prezzo = num(b.prezzo)
      if (prezzo === null || prezzo < 0) return NextResponse.json({ error: 'Prezzo non valido' }, { status: 400 })
      const min = num(b.min)
      const max = num(b.max)
      if ((min !== null && prezzo < min) || (max !== null && prezzo > max)) {
        return NextResponse.json({ error: 'Il prezzo è fuori dai limiti indicati' }, { status: 400 })
      }
      const tariffa = await nuovoPrezzo(id, { prezzo, min, max, dal: String(b.dal ?? '') })
      await logAzione({
        utente: g.email,
        nome: g.nome,
        azione: 'preventivi.tariffa_prezzo',
        entita: 'TariffaPreventivi',
        entitaId: id,
        dettagli: { codice: tariffa.codice, prezzo, dal: tariffa.dal, nuova: tariffa.spItemId },
      })
      return NextResponse.json({ tariffa })
    }
    if (b.tipo === 'chiudi') {
      await chiudiVoce(id, String(b.al ?? ''))
      await logAzione({ utente: g.email, nome: g.nome, azione: 'preventivi.tariffa_chiudi', entita: 'TariffaPreventivi', entitaId: id, dettagli: { al: b.al } })
      return NextResponse.json({ ok: true })
    }
    if (b.tipo === 'modifica') {
      const voce = String(b.voce ?? '').trim()
      if (!voce) return NextResponse.json({ error: 'Il nome della voce non può essere vuoto' }, { status: 400 })
      await aggiornaTariffa(id, {
        voce: voce.slice(0, 200),
        gruppo: String(b.gruppo ?? '').trim().slice(0, 80) || undefined,
        note: String(b.note ?? '').slice(0, 2000),
        modelli: Array.isArray(b.modelli) ? b.modelli.filter((m: string): m is Modello => (ELENCO_MODELLI as string[]).includes(m)) : undefined,
        ordine: num(b.ordine) ?? undefined,
        bloccato: typeof b.bloccato === 'boolean' ? b.bloccato : undefined,
      })
      await logAzione({ utente: g.email, nome: g.nome, azione: 'preventivi.tariffa_modifica', entita: 'TariffaPreventivi', entitaId: id })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Tipo di modifica non valido' }, { status: 400 })
  } catch (e) {
    return rispostaErrore(e)
  }
}
