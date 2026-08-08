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
import { guardValidatore, puoAgireSu } from '@/lib/timbrature/guard'
import { creaTimbratura, leggiRiga } from '@/lib/timbrature/data'
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
    const esito = await creaTimbratura(dipendenteId, leggiRiga(body), g.v.email, { perConto: true })
    for (const riga of esito.righe) {
      await logAzione({
        utente: g.v.email,
        nome: g.v.session.user.name,
        azione: 'timbrature.riga-per-conto',
        entita: 'Timbratura',
        entitaId: riga.id,
        dettagli: { dipendenteId, data: riga.data, ore: riga.ore },
      })
    }
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore salvataggio' }, { status: 400 })
  }
}
