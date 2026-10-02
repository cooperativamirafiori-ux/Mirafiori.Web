/**
 * Un lavoro di Cura Ambienti.
 *
 *   PATCH { stato }  → cambia stato (regole in lib/cura-ambienti/flusso.ts)
 *   PATCH {dati}     → modifica preventivo, consuntivo e intestazione
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardCuraAmbienti } from '@/lib/cura-ambienti/guard'
import { aggiornaLavoro, cambiaStato } from '@/lib/cura-ambienti/data'
import { leggiDati } from '@/lib/cura-ambienti/flusso'
import { STATI_LAVORO, type StatoLavoro } from '@/types/cura-ambienti'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCuraAmbienti()
  if (g.error) return g.error
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })

  let b: Record<string, unknown>
  try {
    b = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  try {
    if (typeof b.stato === 'string') {
      if (!(b.stato in STATI_LAVORO)) return NextResponse.json({ error: 'Stato non valido' }, { status: 400 })
      const lavoro = await cambiaStato(id, b.stato as StatoLavoro, g.email)
      await logAzione({
        utente: g.email,
        nome: g.session.user?.name,
        azione: 'cura_ambienti.stato_lavoro',
        entita: 'LavoroCuraAmbienti',
        entitaId: id,
        dettagli: { numero: lavoro.numero, stato: lavoro.stato },
      })
      return NextResponse.json({ lavoro })
    }

    const letto = leggiDati(b)
    if ('problemi' in letto) return NextResponse.json({ error: letto.problemi.join(' · ') }, { status: 400 })
    const lavoro = await aggiornaLavoro(id, letto.dati, g.email)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'cura_ambienti.modifica_lavoro',
      entita: 'LavoroCuraAmbienti',
      entitaId: id,
      dettagli: { numero: lavoro.numero },
    })
    return NextResponse.json({ lavoro })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Operazione non riuscita' }, { status: 400 })
  }
}
