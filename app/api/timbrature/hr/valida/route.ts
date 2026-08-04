/**
 * POST /api/timbrature/hr/valida   body: { dipendenteId, anno, mese }
 *
 * Il responsabile (o le HR) approva il foglio ore del mese: viene generato il
 * documento, archiviato nella cartella personale e inviato al dipendente in PDF
 * con i pulsanti di conferma.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardValidatore, puoAgireSu } from '@/lib/timbrature-guard'
import { validaFoglio } from '@/lib/timbrature-flusso'
import { logAzione } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// La generazione del foglio + conversione PDF + invio mail puo' superare i
// 10 secondi di default su una connessione lenta a Graph.
export const maxDuration = 60

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
  const anno = Number(body?.anno)
  const mese = Number(body?.mese)
  if (!dipendenteId || !anno || !mese) {
    return NextResponse.json({ error: 'dipendenteId, anno, mese obbligatori' }, { status: 400 })
  }
  const negato = await puoAgireSu(g.v, dipendenteId)
  if (negato) return NextResponse.json({ error: negato }, { status: 403 })

  try {
    const esito = await validaFoglio(dipendenteId, anno, mese, {
      email: g.v.email,
      nome: g.v.session.user.name,
    })
    if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: 400 })
    await logAzione({
      utente: g.v.email,
      nome: g.v.session.user.name,
      azione: 'timbrature.valida',
      entita: 'FoglioOre',
      entitaId: `${dipendenteId}/${anno}-${mese}`,
      dettagli: { hr: g.v.hr, senzaPdf: esito.senzaPdf },
    })
    return NextResponse.json({ chiusura: esito.chiusura, senzaPdf: esito.senzaPdf })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore validazione' }, { status: 500 })
  }
}
