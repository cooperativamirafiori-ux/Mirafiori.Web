/**
 * POST /api/timbrature/hr/riga
 *   body: { dipendenteId, data, servizioId, oraInizio, oraFine, mutua, note }
 *
 * Riga inserita dal responsabile (o dalle HR) PER CONTO del dipendente.
 *
 * E' la valvola di sfogo del sistema: il dipendente ha solo tre giorni, ma una
 * malattia, un telefono scarico o una dimenticanza non possono trasformarsi in
 * ore perse. La riga viene marcata come scritta da altri e appare cosi' anche
 * nel foglio ore: chi conferma deve poter vedere che non l'ha scritta lui.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardValidatore, puoAgireSu } from '@/lib/timbrature-guard'
import { creaTimbratura } from '@/lib/timbrature'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await guardValidatore()
  if (g.error) return g.error
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const dipendenteId = Number(body?.dipendenteId)
  if (!dipendenteId || !body?.data || !body?.servizioId) {
    return NextResponse.json({ error: 'dipendenteId, data e servizio obbligatori' }, { status: 400 })
  }
  const negato = await puoAgireSu(g.v, dipendenteId)
  if (negato) return NextResponse.json({ error: negato }, { status: 403 })

  try {
    const timbratura = await creaTimbratura(
      dipendenteId,
      {
        data: String(body.data).slice(0, 10),
        servizioId: Number(body.servizioId),
        oraInizio: body.oraInizio ?? null,
        oraFine: body.oraFine ?? null,
        mutua: !!body.mutua,
        note: body.note ?? null,
      },
      g.v.email,
      { perConto: true },
    )
    await logAzione({
      utente: g.v.email,
      nome: g.v.session.user.name,
      azione: 'timbrature.riga-per-conto',
      entita: 'Timbratura',
      entitaId: timbratura.id,
      dettagli: { dipendenteId, data: timbratura.data, ore: timbratura.ore },
    })
    return NextResponse.json({ timbratura })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore salvataggio' }, { status: 400 })
  }
}
