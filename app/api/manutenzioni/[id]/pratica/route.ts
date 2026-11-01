/**
 * Conversazione della richiesta di manutenzione.
 *
 * GET  ?come=gestione|richiedente → messaggi + cose da fare; segna letti i
 *      messaggi dell'altra parte. Alla gestione anche i costi; al richiedente
 *      il solo totale, a richiesta completata.
 * POST { come, testo }            → nuovo messaggio + mail all'altra parte
 *      (al richiedente se scrive la gestione, a MANUTENZIONI_MAIL_TO se scrive
 *      il richiedente).
 *
 * [id] = spItemId. Piano: docs/manutenzioni-piano.md.
 */

import { NextRequest, NextResponse } from 'next/server'
import { accessoPratica } from '@/lib/manutenzioni/accesso'
import { leggiPratica, scriviMessaggio, pulisciTesto } from '@/lib/manutenzioni/pratica'
import { leggiCosti, totaleDi } from '@/lib/manutenzioni/costi'
import { notificaNuovoMessaggio } from '@/lib/manutenzioni/notifiche'
import { getSPUserEmailByLookupId } from '@/lib/core/sp'
import { logAzione } from '@/lib/core/audit'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await accessoPratica(id, req.nextUrl.searchParams.get('come'))
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  try {
    const pratica = await leggiPratica(id, a.lato)
    // Costi: la gestione vede l'elenco; il richiedente solo il totale, e solo a
    // richiesta completata (decisione di Dennis, 31 ott 2026).
    const vediTotale = a.lato === 'gestione' || a.richiesta.stato === 'Completata'
    if (vediTotale) {
      try {
        const costi = await leggiCosti(id)
        const { totale, incompleto } = totaleDi(costi)
        if (a.lato === 'gestione') pratica.costi = costi
        if (costi.length) {
          pratica.totaleCosti = totale
          pratica.totaleIncompleto = incompleto
        }
      } catch (e) {
        // Messaggi e cose da fare restano utili anche se i costi non si leggono.
        console.error(`[GET /api/manutenzioni/${id}/pratica] costi`, e)
        if (a.lato === 'gestione') pratica.costi = undefined
      }
    }
    return NextResponse.json(pratica)
  } catch (e: any) {
    console.error(`[GET /api/manutenzioni/${id}/pratica]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: { come?: unknown; testo?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const a = await accessoPratica(id, body.come)
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })

  const testo = pulisciTesto(body.testo)
  if (!testo) return NextResponse.json({ error: 'Scrivi il messaggio' }, { status: 400 })

  try {
    const messaggio = await scriviMessaggio({
      richiesta: a.richiesta,
      lato: a.lato,
      testo,
      autoreEmail: a.email,
      autoreNome: a.nome,
    })

    const richiedenteEmail = a.richiesta.richiedente.lookupId
      ? await getSPUserEmailByLookupId(a.richiesta.richiedente.lookupId).catch(() => '')
      : ''
    notificaNuovoMessaggio({
      spItemId: id,
      idRichiesta: a.richiesta.idRichiesta,
      struttura: a.richiesta.struttura.value,
      daGestione: a.lato === 'gestione',
      autoreNome: a.nome,
      richiedenteEmail,
      testo,
    }).catch(console.error)

    await logAzione({
      utente: a.email,
      nome: a.nome,
      azione: 'manutenzione.messaggio',
      entita: 'RichiestaManutenzione',
      entitaId: a.richiesta.idRichiesta,
      dettagli: { lato: a.lato },
    })

    return NextResponse.json({ ok: true, messaggio })
  } catch (e: any) {
    console.error(`[POST /api/manutenzioni/${id}/pratica]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
