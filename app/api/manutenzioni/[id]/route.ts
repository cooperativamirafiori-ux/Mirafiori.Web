/**
 * PATCH /api/manutenzioni/[id] — Aggiorna richiesta
 *
 * Due casi gestiti dallo stesso endpoint in base ai campi presenti nel body:
 *
 * CASO A — Assegnazione tecnico (replica Flusso 2B):
 *   Se { tecnicoId, tecnicoNome } presenti:
 *     1. Aggiorna Tecnico e Stato → "In lavorazione"
 *     2. Notifica richiedente (Teams DM + email)
 *
 * CASO B — Chiusura (dal 1/11/2026):
 *   Se { chiudi: true }:
 *     1. Stato → "Completata" (+ data intervento e note interne se ci sono)
 *     2. Mail alla gestione (con il totale dei costi) e al richiedente
 *   I costi NON si scrivono qui: stanno nella sezione Costi della richiesta.
 *
 * [id] = spItemId (ID stringa item SharePoint)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { getRichiestaById, aggiornaRichiesta } from '@/lib/manutenzioni/data'
import { getSPUserEmailByLookupId } from '@/lib/core/sp'
import { leggiCosti, totaleDi } from '@/lib/manutenzioni/costi'
import { notificaTecnicoAssegnato, notificaChiusuraTicket } from '@/lib/manutenzioni/notifiche'
import { annotaInConversazione } from '@/lib/manutenzioni/pratica'
import { logAzione } from '@/lib/core/audit'
import type { AggiornaRichiestaPayload } from '@/types/manutenzioni'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  }

  const { id: spItemId } = await params
  let body: AggiornaRichiestaPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  try {
    const richiesta = await getRichiestaById(spItemId)

    // ---- CASO A: assegnazione tecnico ----
    if (body.tecnicoId !== undefined && body.tecnicoNome !== undefined) {
      if (richiesta.stato === 'Completata') {
        return NextResponse.json(
          { error: 'Richiesta già completata' },
          { status: 409 }
        )
      }

      await aggiornaRichiesta(spItemId, {
        TecnicoLookupId: body.tecnicoId,   // Lookup column → {Campo}LookupId
        Stato: 'In lavorazione',            // Choice column → stringa semplice
        ...(body.noteResponsabile ? { NoteDennis: body.noteResponsabile } : {}),
      })

      // Recupera email richiedente tramite lookupId
      const lookupId = richiesta.richiedente.lookupId
      console.log('[PATCH] assegna tecnico — richiedente lookupId:', lookupId)
      const richiedenteEmail = lookupId
        ? await getSPUserEmailByLookupId(lookupId).catch((e) => { console.error('[PATCH] getSPUserEmailByLookupId error:', e); return '' })
        : ''
      console.log('[PATCH] richiedenteEmail risolto:', richiedenteEmail)
      notificaTecnicoAssegnato({
        idRichiesta: richiesta.idRichiesta,
        richiedenteEmail,
        richiedenteNome: richiesta.richiedente.displayName,
        tecnicoNome: body.tecnicoNome,
        tecnicoTelefono: '',
        note: body.noteResponsabile,
      }).catch(console.error)

      // Resta nella conversazione della richiesta, con la nota se c'era.
      await annotaInConversazione({
        richiesta,
        lato: 'gestione',
        tipo: 'tecnico_assegnato',
        testo: `Tecnico assegnato: ${body.tecnicoNome}${body.noteResponsabile ? `\n\n${body.noteResponsabile}` : ''}`,
        autoreEmail: session.user.email,
        autoreNome: session.user.name,
      })

      await logAzione({
        utente: session.user.email,
        nome: session.user.name,
        azione: 'manutenzione.assegna-tecnico',
        entita: 'RichiestaManutenzione',
        entitaId: richiesta.idRichiesta,
        dettagli: { tecnico: body.tecnicoNome, note: body.noteResponsabile ?? undefined },
      })

      return NextResponse.json({ ok: true, stato: 'In lavorazione' })
    }

    // ---- CASO B: chiusura ----
    // Dal 1/11/2026 la chiusura chiude e basta: i costi stanno nella sezione
    // Costi della richiesta (lib/manutenzioni/costi.ts) e il cruscotto Costi
    // per struttura li legge da lì. Prima qui si chiedevano importo fattura e
    // ore e si scriveva una riga in Costi Strutture: tolto con l'ok di Dennis
    // (31/10/2026), le richieste già chiuse tengono i loro valori.
    if (body.chiudi === true) {
      if (richiesta.stato === 'Completata') {
        return NextResponse.json(
          { error: 'Richiesta già completata' },
          { status: 409 }
        )
      }

      const updateFields: Record<string, unknown> = {
        Stato: 'Completata',
        ...(body.dataIntervento ? { DataIntervento: body.dataIntervento } : {}),
        ...(body.noteResponsabile ? { NoteDennis: body.noteResponsabile } : {}),
      }
      await aggiornaRichiesta(spItemId, updateFields)

      // Il totale serve solo alla mail della gestione: se i costi non si
      // leggono, la chiusura vale lo stesso.
      const { totale: importoTotale } = await leggiCosti(spItemId)
        .then(totaleDi)
        .catch(() => ({ totale: 0 }))

      const richiedenteEmailChiusura = richiesta.richiedente.lookupId
        ? await getSPUserEmailByLookupId(richiesta.richiedente.lookupId).catch(() => '')
        : ''
      notificaChiusuraTicket({
        idRichiesta: richiesta.idRichiesta,
        struttura: richiesta.struttura.value,
        importoTotale,
        tecnicoNome: richiesta.tecnico?.value ?? '—',
        richiedenteEmail: richiedenteEmailChiusura,
        richiedenteNome: richiesta.richiedente.displayName,
      }).catch(console.error)

      await annotaInConversazione({
        richiesta,
        lato: 'gestione',
        tipo: 'chiusura',
        testo: 'Richiesta completata.',
        autoreEmail: session.user.email,
        autoreNome: session.user.name,
      })

      await logAzione({
        utente: session.user.email,
        nome: session.user.name,
        azione: 'manutenzione.chiudi',
        entita: 'RichiestaManutenzione',
        entitaId: richiesta.idRichiesta,
        dettagli: { importoTotale, struttura: richiesta.struttura.value },
      })

      return NextResponse.json({ ok: true, stato: 'Completata', importoTotale })
    }

    // Aggiornamento generico (note, data intervento)
    const genericFields: Record<string, unknown> = {}
    if (body.noteResponsabile != null) genericFields.NoteDennis = body.noteResponsabile
    if (body.dataIntervento != null) genericFields.DataIntervento = body.dataIntervento
    if (Object.keys(genericFields).length > 0) {
      await aggiornaRichiesta(spItemId, genericFields)
      await logAzione({
        utente: session.user.email,
        nome: session.user.name,
        azione: 'manutenzione.aggiorna',
        entita: 'RichiestaManutenzione',
        entitaId: richiesta.idRichiesta,
        dettagli: { campi: Object.keys(genericFields) },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error(`[PATCH /api/manutenzioni/${spItemId}]`, err)
    return NextResponse.json(
      { error: err.message ?? 'Errore interno' },
      { status: 500 }
    )
  }
}
