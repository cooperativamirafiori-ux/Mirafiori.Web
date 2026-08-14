/**
 * POST /api/acquisti — nuova richiesta di acquisto (qualsiasi utente loggato)
 * GET  /api/acquisti — elenco completo (solo gestori, area "Acquisti")
 *
 * All'invio:
 *   1. crea l'item e assegna il codice ACQ-{anno}-{nnn};
 *   2. se esiste un solo gestore, la richiesta nasce già presa in carico da lui
 *      (la fase di smistamento manuale non aggiunge informazione);
 *   3. se l'urgenza è "Urgente" avvisa subito i gestori, altrimenti la richiesta
 *      viaggia nel digest giornaliero.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { guardArea } from '@/lib/core/api-guard'
import { creaAcquisto, getAcquisti, acquistiConfigurato, AREA_ACQUISTI } from '@/lib/acquisti/data'
import { emailGestori, linkGestione } from '@/lib/acquisti/flusso'
import { getSPUserLookupId } from '@/lib/core/sp'
import { getStrutture, centroCostoDiStruttura } from '@/lib/strutture/data'
import { notificaAcquistoUrgente } from '@/lib/acquisti/notifiche'
import { logAzione } from '@/lib/core/audit'
import { CATEGORIE_SPESA, URGENZE, dataBreve } from '@/types/acquisti'
import type { NuovaRichiestaAcquistoPayload } from '@/types/acquisti'

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardArea(AREA_ACQUISTI)
  if (g.error) return g.error
  if (!acquistiConfigurato()) {
    return NextResponse.json({ error: 'Sezione acquisti non configurata' }, { status: 503 })
  }
  try {
    return NextResponse.json({ acquisti: await getAcquisti() })
  } catch (err: any) {
    console.error('[GET /api/acquisti]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  if (!acquistiConfigurato()) {
    return NextResponse.json({ error: 'Sezione acquisti non configurata' }, { status: 503 })
  }

  let body: NuovaRichiestaAcquistoPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const strutturaId = Number(body.strutturaId)
  const centroCostoId = Number(body.centroCostoId) || 0
  const descrizione = (body.descrizione ?? '').trim()
  const quantita = Number(body.quantita) || 1
  const urgenza = body.urgenza ?? ''
  const categoria = body.categoria ?? ''

  if (!strutturaId || !descrizione || !categoria || !urgenza) {
    return NextResponse.json(
      { error: 'Compila struttura, descrizione, categoria e urgenza.' },
      { status: 400 },
    )
  }
  if (!URGENZE.includes(urgenza as any)) {
    return NextResponse.json({ error: 'Urgenza non valida' }, { status: 400 })
  }
  if (!CATEGORIE_SPESA.includes(categoria as any)) {
    return NextResponse.json({ error: 'Categoria non valida' }, { status: 400 })
  }
  if (quantita < 1) {
    return NextResponse.json({ error: 'La quantità deve essere almeno 1.' }, { status: 400 })
  }

  try {
    const richiedenteLookupId = await getSPUserLookupId(session.user.email)

    // Un solo gestore → la richiesta gli è assegnata direttamente: uno
    // smistamento manuale con un solo destinatario è solo un'attesa in più.
    const gestori = await emailGestori()
    let assegnatoLookupId: number | undefined
    if (gestori.length === 1) {
      try {
        assegnatoLookupId = await getSPUserLookupId(gestori[0])
      } catch {
        assegnatoLookupId = undefined
      }
    }

    // Se il richiedente non l'ha cambiato, il centro di costo è quello della
    // struttura: la richiesta nasce comunque imputata a qualcuno.
    const centroCostoFinale =
      centroCostoId || (await centroCostoDiStruttura(strutturaId)) || undefined

    const { spItemId, codice } = await creaAcquisto({
      strutturaId,
      centroCostoId: centroCostoFinale,
      richiedenteLookupId,
      descrizione,
      quantita,
      link: body.link?.trim(),
      urgenza,
      serveEntro: body.serveEntro,
      categoria,
      assegnatoLookupId,
    })

    if (urgenza === 'Urgente') {
      const strutture = await getStrutture().catch(() => [])
      const struttura = strutture.find((s) => s.id === strutturaId)
      notificaAcquistoUrgente({
        to: gestori.length ? gestori : [process.env.MAIL_SENDER_EMAIL!],
        codice,
        richiedente: session.user.name ?? session.user.email,
        struttura: struttura?.strutturaLabel ?? '—',
        descrizione,
        quantita,
        categoria,
        serveEntro: body.serveEntro ? dataBreve(body.serveEntro) : undefined,
        link: body.link?.trim(),
        linkApp: linkGestione(),
      }).catch(console.error)
    }

    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: 'acquisto.crea',
      entita: 'RichiestaAcquisto',
      entitaId: codice,
      dettagli: { strutturaId, categoria, urgenza, quantita, autoAssegnata: Boolean(assegnatoLookupId) },
    })

    return NextResponse.json({ codice, spItemId }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/acquisti]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
