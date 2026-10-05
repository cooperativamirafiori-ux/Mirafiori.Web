/**
 * POST /api/timbrature/hr/reperibilita
 *   body: { dipendenteId, data, attiva }
 *
 * Giornata di reperibilita' spuntata (o tolta) dal responsabile o dalle HR per
 * conto del dipendente: e' la stessa valvola di sfogo delle righe di ore,
 * senza finestra dei tre giorni ma ferma davanti a un foglio gia' validato.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardValidatore, puoAgireSu } from '@/lib/timbrature/guard'
import { impostaReperibilita } from '@/lib/timbrature/data'
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
  if (!dipendenteId || !body?.data) {
    return NextResponse.json({ error: 'dipendenteId e data obbligatori' }, { status: 400 })
  }
  const negato = await puoAgireSu(g.v, dipendenteId)
  if (negato) return NextResponse.json({ error: negato }, { status: 403 })

  try {
    const attiva = !!body.attiva
    await impostaReperibilita(dipendenteId, String(body.data), attiva, g.v.email, { perConto: true })
    await logAzione({
      utente: g.v.email,
      nome: g.v.session.user.name,
      azione: attiva ? 'timbrature.reperibilita-per-conto' : 'timbrature.reperibilita-tolta-per-conto',
      entita: 'Timbratura',
      entitaId: `${dipendenteId}-${body.data}`,
      dettagli: { dipendenteId, data: body.data },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore salvataggio' }, { status: 400 })
  }
}
