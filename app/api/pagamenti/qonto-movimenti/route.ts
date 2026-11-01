/**
 * GET  /api/pagamenti/qonto-movimenti — uscite Qonto da abbinare (con le fatture
 *      proposte) e abbinamenti degli ultimi 30 giorni.
 * POST /api/pagamenti/qonto-movimenti — una decisione:
 *      { azione: 'controlla' }                                  legge Qonto e abbina adesso
 *      { azione: 'abbina', movimentoId, scadenzaIds }           abbinamento a mano
 *      { azione: 'ignora', movimentoId, nota?, sempre? }        non serve fattura
 *      { azione: 'annulla', movimentoId }                       annulla abbinamento o "ignora"
 *
 * Permesso: 'Pagamenti' (chiudere una fattura è registrare un pagamento).
 * Regole: docs/riconciliazione-qonto.md.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPagamento } from '@/lib/pagamenti/guard'
import { logAzione } from '@/lib/core/audit'
import { qontoConfigurato } from '@/lib/qonto/client'
import {
  abbinaAMano,
  annullaAbbinamento,
  elencoRiconciliazione,
  ignora,
  riconciliaQonto,
} from '@/lib/qonto/riconciliazione'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET() {
  const g = await guardPagamento()
  if (g.error) return g.error
  try {
    return NextResponse.json(await elencoRiconciliazione())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore di lettura' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await guardPagamento()
  if (g.error) return g.error
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const azione = String(body.azione ?? '')
  const movimentoId = typeof body.movimentoId === 'string' ? body.movimentoId : ''

  try {
    let esito: unknown
    if (azione === 'controlla') {
      if (!qontoConfigurato()) return NextResponse.json({ error: 'Qonto non è configurato sul server' }, { status: 503 })
      esito = await riconciliaQonto()
    } else if (!movimentoId) {
      return NextResponse.json({ error: 'Movimento non indicato' }, { status: 400 })
    } else if (azione === 'abbina') {
      const ids = Array.isArray(body.scadenzaIds)
        ? body.scadenzaIds.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 50)
        : []
      esito = await abbinaAMano(movimentoId, ids, g.email)
    } else if (azione === 'ignora') {
      esito = await ignora(movimentoId, String(body.nota ?? ''), body.sempre === true, g.email)
    } else if (azione === 'annulla') {
      esito = await annullaAbbinamento(movimentoId, g.email)
    } else {
      return NextResponse.json({ error: 'Azione sconosciuta' }, { status: 400 })
    }
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: `pagamenti.qonto.${azione}`,
      entita: 'MovimentoQonto',
      entitaId: movimentoId || null,
      dettagli: { ...body, esito },
    })
    return NextResponse.json({ ok: true, esito })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Operazione non riuscita' }, { status: 400 })
  }
}
