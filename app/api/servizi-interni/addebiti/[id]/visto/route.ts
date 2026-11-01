/**
 * POST /api/servizi-interni/addebiti/[id]/visto — { visto: 'visto' | 'non_torna' | null, nota? }
 *
 * Il visto di chi riceve l'addebito. È informativo (decisione di Dennis,
 * 1/11/2026): dice che l'ha visto o che non gli torna, l'addebito vale comunque.
 * null toglie il visto. Si può dare anche a mese chiuso. "Non mi torna" manda
 * una mail ai coordinatori del servizio che ha addebitato.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardServiziInterni } from '@/lib/servizi-interni/guard'
import { puoVistare } from '@/lib/servizi-interni/accesso'
import { getAddebito, getCentriScelta, vistaAddebito } from '@/lib/servizi-interni/data'
import { notificaNonTorna } from '@/lib/servizi-interni/notifiche'
import { logAzione } from '@/lib/core/audit'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardServiziInterni()
  if (g.error) return g.error
  let body: { visto?: unknown; nota?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const visto = body.visto === 'visto' || body.visto === 'non_torna' ? body.visto : null
  if (body.visto !== null && visto === null) return NextResponse.json({ error: 'Valore non valido' }, { status: 400 })
  const nota = typeof body.nota === 'string' ? body.nota.trim().slice(0, 1000) || null : null
  if (visto === 'non_torna' && !nota) {
    return NextResponse.json({ error: 'Scrivi cosa non ti torna' }, { status: 400 })
  }

  try {
    const a = await getAddebito(id)
    if (!a) return NextResponse.json({ error: 'Addebito non trovato' }, { status: 404 })
    if (!puoVistare(g.accesso, a.ccA)) {
      return NextResponse.json({ error: 'Il visto lo mette chi coordina il servizio che riceve l\'addebito' }, { status: 403 })
    }
    const addebito = await vistaAddebito(id, visto, nota, g.email)
    if (visto === 'non_torna') {
      const centri = await getCentriScelta()
      const nome = (c: string) => centri.find((x) => x.codice === c)?.nome ?? c
      notificaNonTorna({ addebito, nomeDa: nome(a.ccDa), nomeA: nome(a.ccA), chi: g.nome }).catch(console.error)
    }
    await logAzione({
      utente: g.email,
      nome: g.nome,
      azione: 'addebito-interno.visto',
      entita: 'AddebitoInterno',
      entitaId: String(a.numero),
      dettagli: { visto, nota: nota ?? undefined },
    })
    return NextResponse.json({ ok: true, addebito })
  } catch (e: any) {
    console.error(`[POST /api/servizi-interni/addebiti/${id}/visto]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
