/**
 * Passaggi di stato di un preventivo.
 *
 *   POST { azione: 'emetti' | 'riapri' | 'accetta' | 'rifiuta' | 'annulla' | 'rinnova' | 'duplica',
 *          data?: 'YYYY-MM-DD', nota?: string }
 *
 * Regole in lib/preventivi/flusso.ts, operazioni in lib/preventivi/azioni.ts.
 * "rinnova" e "duplica" rispondono con il preventivo NUOVO.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPreventivi, leggiCorpo, rispostaErrore } from '@/lib/preventivi/guard'
import { accetta, annulla, copia, emetti, riapri, rifiuta } from '@/lib/preventivi/azioni'
import { isoValida, oggiIso } from '@/lib/preventivi/calcoli'
import type { Azione } from '@/lib/preventivi/flusso'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AZIONI: Azione[] = ['emetti', 'riapri', 'accetta', 'rifiuta', 'annulla', 'rinnova', 'duplica']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardPreventivi()
  if (g.error) return g.error
  const { id } = await params
  const b = await leggiCorpo(req)
  const azione = b?.azione as Azione
  if (!AZIONI.includes(azione)) return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
  const data = isoValida(b?.data) ? (b!.data as string) : oggiIso()
  const nota = String(b?.nota ?? '').trim().slice(0, 1000)
  if (data > oggiIso()) return NextResponse.json({ error: 'La data non può essere nel futuro' }, { status: 400 })
  const chi = g.nome || g.email
  const autore = { email: g.email, nome: g.nome }

  try {
    let risposta: Record<string, unknown>
    switch (azione) {
      case 'emetti':
        risposta = { preventivo: await emetti(id, g.accesso) }
        break
      case 'riapri':
        risposta = { preventivo: await riapri(id, g.accesso) }
        break
      case 'accetta':
        risposta = { preventivo: await accetta(id, g.accesso, data, nota, chi) }
        break
      case 'rifiuta':
        risposta = { preventivo: await rifiuta(id, g.accesso, data, nota, chi) }
        break
      case 'annulla':
        risposta = { preventivo: await annulla(id, g.accesso) }
        break
      case 'rinnova':
      case 'duplica':
        risposta = await copia(id, g.accesso, autore, azione)
        break
    }
    const p = risposta.preventivo as { spItemId: string; numero: string; stato: string }
    await logAzione({
      utente: g.email,
      nome: g.nome,
      azione: `preventivi.${azione}`,
      entita: 'Preventivo',
      entitaId: id,
      dettagli: { numero: p.numero, stato: p.stato, ...(p.spItemId !== id ? { nuovo: p.spItemId } : {}) },
    })
    return NextResponse.json(risposta)
  } catch (e) {
    return rispostaErrore(e)
  }
}
