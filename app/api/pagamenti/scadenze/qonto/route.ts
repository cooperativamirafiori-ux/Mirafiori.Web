/**
 * POST /api/pagamenti/scadenze/qonto — "Invia a Qonto" { ids }
 *
 * Crea su Qonto le richieste di bonifico (una per sottoconto). Il denaro non
 * si muove finché qualcuno non le approva nell'app Qonto. Regole in
 * lib/qonto/bonifici.ts.
 *
 * Permesso: 'Pagamenti'.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPagamento } from '@/lib/pagamenti/guard'
import { inviaAQonto } from '@/lib/qonto/bonifici'
import { qontoOAuthConfigurato } from '@/lib/qonto/oauth'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const g = await guardPagamento()
  if (g.error) return g.error
  if (!qontoOAuthConfigurato()) {
    return NextResponse.json({ error: 'Qonto non è collegato all’app per i bonifici (mancano le credenziali OAuth sul server)' }, { status: 503 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const v = (body as { ids?: unknown })?.ids
  const ids = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 400) : []
  if (ids.length === 0) return NextResponse.json({ error: 'Nessuna scadenza indicata' }, { status: 400 })

  try {
    const esito = await inviaAQonto(ids, g.email)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.invia_qonto',
      entita: 'Scadenza',
      entitaId: ids.length === 1 ? ids[0] : null,
      dettagli: { ids, inviate: esito.inviate, richieste: esito.richieste, ignorate: esito.ignorate },
    })
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invio non riuscito' }, { status: 400 })
  }
}
