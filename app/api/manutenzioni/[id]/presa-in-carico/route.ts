/**
 * POST /api/manutenzioni/[id]/presa-in-carico — { nota, lungoCorso?, previsione? }
 *
 * "Ho visto la vostra richiesta", senza assegnare un tecnico (31 ott 2026):
 *   1. Stato → "Presa in carico" se era Aperta (da In lavorazione non si torna indietro)
 *   2. se indicato, spunta Lungo corso + previsione
 *   3. la nota entra nella conversazione e arriva al richiedente per mail
 *
 * Solo gestione (isAdmin).
 */

import { NextRequest, NextResponse } from 'next/server'
import { accessoPratica } from '@/lib/manutenzioni/accesso'
import { aggiornaRichiesta } from '@/lib/manutenzioni/data'
import { scriviMessaggio, pulisciTesto } from '@/lib/manutenzioni/pratica'
import { notificaPresaInCarico } from '@/lib/manutenzioni/notifiche'
import { getSPUserEmailByLookupId } from '@/lib/core/sp'
import { logAzione } from '@/lib/core/audit'
import type { PresaInCaricoPayload } from '@/types/manutenzioni'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: PresaInCaricoPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const a = await accessoPratica(id, 'gestione')
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  const r = a.richiesta

  if (r.stato === 'Completata') {
    return NextResponse.json({ error: 'Richiesta già completata' }, { status: 409 })
  }
  const nota = pulisciTesto(body.nota)
  if (!nota) return NextResponse.json({ error: 'Scrivi una nota per il richiedente' }, { status: 400 })

  const lungoCorso = body.lungoCorso === true
  const previsione = lungoCorso ? pulisciTesto(body.previsione).slice(0, 255) : ''

  try {
    const campi: Record<string, unknown> = {}
    if (r.stato === 'Aperta') campi.Stato = 'Presa in carico'
    if (lungoCorso) {
      campi.LungoCorso = true
      if (previsione) campi.PrevisioneLungoCorso = previsione
    }
    if (Object.keys(campi).length) await aggiornaRichiesta(id, campi)

    // Qui il messaggio è il cuore dell'operazione: se non si scrive, si dice.
    await scriviMessaggio({
      richiesta: r,
      lato: 'gestione',
      tipo: 'presa_in_carico',
      testo: nota,
      autoreEmail: a.email,
      autoreNome: a.nome,
    })

    const richiedenteEmail = r.richiedente.lookupId
      ? await getSPUserEmailByLookupId(r.richiedente.lookupId).catch(() => '')
      : ''
    notificaPresaInCarico({
      spItemId: id,
      idRichiesta: r.idRichiesta,
      struttura: r.struttura.value,
      richiedenteEmail,
      richiedenteNome: r.richiedente.displayName,
      nota,
      lungoCorso: lungoCorso || r.lungoCorso,
      previsione: previsione || r.previsioneLungoCorso,
    }).catch(console.error)

    await logAzione({
      utente: a.email,
      nome: a.nome,
      azione: 'manutenzione.presa-in-carico',
      entita: 'RichiestaManutenzione',
      entitaId: r.idRichiesta,
      dettagli: { lungoCorso, previsione: previsione || undefined },
    })

    return NextResponse.json({ ok: true, stato: campi.Stato ?? r.stato })
  } catch (e: any) {
    console.error(`[POST /api/manutenzioni/${id}/presa-in-carico]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
