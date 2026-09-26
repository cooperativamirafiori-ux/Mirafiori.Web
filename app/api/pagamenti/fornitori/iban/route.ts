/**
 * POST /api/pagamenti/fornitori/iban — conferma l'IBAN di un fornitore
 * { piva, iban } e sblocca le sue scadenze non pagate.
 *
 * Permesso: 'Pagamenti'. Ogni conferma va nel registro: è il gesto che una
 * truffa sull'IBAN cerca di ottenere, e deve restare chi l'ha fatto.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPagamento } from '@/lib/pagamenti/guard'
import { confermaIban, normIban } from '@/lib/pagamenti/verifica'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await guardPagamento()
  if (g.error) return g.error
  let b: { piva?: unknown; iban?: unknown }
  try {
    b = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  if (typeof b.piva !== 'string' || !b.piva || typeof b.iban !== 'string' || !b.iban) {
    return NextResponse.json({ error: 'Servono P.IVA e IBAN' }, { status: 400 })
  }
  try {
    const r = await confermaIban(b.piva, b.iban, g.email)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.iban.conferma',
      entita: 'Fornitore',
      entitaId: b.piva,
      dettagli: { iban: normIban(b.iban), sbloccate: r.sbloccate },
    })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Conferma non riuscita' }, { status: 400 })
  }
}
