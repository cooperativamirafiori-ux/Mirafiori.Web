/**
 * Un ente dei preventivi.
 *
 *   PATCH { nome?, servizi?, note? } → correzione (chi fa preventivi). Se
 *         cambia il nome si aggiornano anche le righe del tariffario che lo
 *         citano, altrimenti l'ente perderebbe le sue tariffe.
 *   PATCH { attivo } → nasconde o rimette l'ente nell'elenco delle scelte
 *         (solo chi ha il permesso Preventivi o Amministrazione)
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPreventivi, leggiCorpo, rispostaErrore } from '@/lib/preventivi/guard'
import { leggiEnte, modificaEnte } from '@/lib/preventivi/enti'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardPreventivi()
  if (g.error) return g.error
  const { id } = await params
  const b = await leggiCorpo(req)
  if (!b) return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  try {
    if (typeof b.attivo === 'boolean') {
      if (!g.accesso.tutti) return NextResponse.json({ error: 'Solo chi gestisce il tariffario nasconde un ente' }, { status: 403 })
      await modificaEnte(id, { attivo: b.attivo })
      await logAzione({ utente: g.email, nome: g.nome, azione: 'preventivi.ente_attivo', entita: 'EntePreventivi', entitaId: id, dettagli: { attivo: b.attivo } })
      return NextResponse.json({ ok: true })
    }
    const letto = leggiEnte(b)
    if ('problema' in letto) return NextResponse.json({ error: letto.problema }, { status: 400 })
    const tariffe = await modificaEnte(id, letto)
    await logAzione({ utente: g.email, nome: g.nome, azione: 'preventivi.ente_modifica', entita: 'EntePreventivi', entitaId: id, dettagli: { nome: letto.nome, tariffe } })
    return NextResponse.json({ ok: true, tariffe })
  } catch (e) {
    return rispostaErrore(e)
  }
}
