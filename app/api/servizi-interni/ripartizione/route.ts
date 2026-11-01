/**
 * Percentuali dei costi generali (cc23 Progettazione - Amministrazione).
 *
 * GET  → versioni salvate (la più recente prima) + centri di costo attivi
 * POST { dal, quote: [{ ccCodice, percentuale }], note? } → nuova versione,
 *      valida da `dal`. La somma deve fare 100. Le versioni prima restano per
 *      i mesi passati.
 *
 * Vede e salva solo chi ha "Controllo di Gestione".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardServiziInterni } from '@/lib/servizi-interni/guard'
import { puoRipartire } from '@/lib/servizi-interni/accesso'
import { getCentriScelta, getRipartizioni, salvaRipartizione } from '@/lib/servizi-interni/data'
import { validaQuote } from '@/lib/servizi-interni/flusso'
import { logAzione } from '@/lib/core/audit'
import { CC_COSTI_GENERALI } from '@/types/servizi-interni'

export async function GET() {
  const g = await guardServiziInterni()
  if (g.error) return g.error
  if (!puoRipartire(g.accesso)) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  try {
    const [versioni, centri] = await Promise.all([getRipartizioni(CC_COSTI_GENERALI), getCentriScelta()])
    return NextResponse.json({ ccOrigine: CC_COSTI_GENERALI, versioni, centri })
  } catch (e: any) {
    console.error('[GET /api/servizi-interni/ripartizione]', e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await guardServiziInterni()
  if (g.error) return g.error
  if (!puoRipartire(g.accesso)) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  let body: { dal?: unknown; quote?: unknown; note?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const dal = typeof body.dal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dal) ? `${body.dal.slice(0, 7)}-01` : ''
  if (!dal) return NextResponse.json({ error: 'Scegli da quando valgono' }, { status: 400 })
  let quote
  try {
    quote = validaQuote(Array.isArray(body.quote) ? body.quote : [], CC_COSTI_GENERALI)
    const centri = new Set((await getCentriScelta()).map((c) => c.codice))
    const ignoto = quote.find((q) => !centri.has(q.ccCodice))
    if (ignoto) throw new Error(`Centro di costo ${ignoto.ccCodice} non trovato o non attivo`)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Percentuali non valide' }, { status: 400 })
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null
  try {
    await salvaRipartizione(CC_COSTI_GENERALI, dal, quote, note, g.email)
    await logAzione({
      utente: g.email,
      nome: g.nome,
      azione: 'costi-generali.percentuali',
      entita: 'RipartizioneGenerali',
      entitaId: `${CC_COSTI_GENERALI}@${dal}`,
      dettagli: { quote: Object.fromEntries(quote.map((q) => [q.ccCodice, q.percentuale])) },
    })
    return NextResponse.json({ ok: true, versioni: await getRipartizioni(CC_COSTI_GENERALI) })
  } catch (e: any) {
    console.error('[POST /api/servizi-interni/ripartizione]', e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
