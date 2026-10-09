/**
 * POST /api/utenze/collega — un codice arrivato in fattura e sconosciuto alla
 * Mappatura diventa un'utenza. Due modi:
 *   { codice, segnapostoId } → la riga segnaposto (es. "POD-B05") prende il codice vero;
 *   { codice, tipo, strutturaId, percentuale, … } → riga nuova.
 * Poi tutte le bollette in attesa di quel codice vengono divise sulle strutture.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { aggiornaUtenza, collegaCodice, creaUtenza, getMappatura } from '@/lib/utenze/data'
import { AREA_AMMINISTRAZIONE, leggiDatiMappatura, normCodice } from '@/types/utenze'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await guardArea(AREA_AMMINISTRAZIONE)
  if (g.error) return g.error
  const body = await req.json().catch(() => ({}))
  const codice = normCodice(String(body.codice ?? ''))
  if (!codice) return NextResponse.json({ error: 'Codice mancante' }, { status: 400 })
  try {
    let rigaId: number
    const segnapostoId = Number(body.segnapostoId ?? 0)
    // Il codice è già in Mappatura (aggiunto da SharePoint o da uno script):
    // niente riga nuova, che farebbe superare il 100%; si collegano le bollette.
    const gia = (await getMappatura()).find((m) => normCodice(m.codice) === codice && m.strutturaId)
    if (gia) {
      const collegate = await collegaCodice(codice, g.session.user.email!)
      return NextResponse.json({ ok: true, collegate, gia: true })
    }
    if (segnapostoId) {
      const riga = (await getMappatura()).find((m) => m.id === segnapostoId)
      if (!riga || !riga.strutturaId) return NextResponse.json({ error: 'Riga segnaposto non trovata o senza struttura' }, { status: 400 })
      if (riga.tipo === 'altro') return NextResponse.json({ error: 'La riga segnaposto non ha il tipo di fornitura' }, { status: 400 })
      await aggiornaUtenza(segnapostoId, {
        codice,
        tipo: riga.tipo,
        strutturaId: riga.strutturaId,
        percentuale: riga.percentuale,
        fornitore: riga.fornitore,
        note: [riga.note, `prima: ${riga.codice}`].filter(Boolean).join(' · '),
      })
      rigaId = segnapostoId
    } else {
      const r = leggiDatiMappatura({ ...body, codice })
      if ('problemi' in r) return NextResponse.json({ error: r.problemi.join('. ') }, { status: 400 })
      rigaId = await creaUtenza(r.dati)
    }
    const collegate = await collegaCodice(codice, g.session.user.email!)
    await logAzione({ utente: g.session.user.email, azione: 'utenze.collega', entita: 'Utenza', entitaId: rigaId, dettagli: { codice, segnapostoId: segnapostoId || null, collegate } })
    return NextResponse.json({ ok: true, collegate })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
