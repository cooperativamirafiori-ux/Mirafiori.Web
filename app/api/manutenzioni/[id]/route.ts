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
 * CASO B — Chiusura ticket (replica Flusso 2C):
 *   Se { importoFattura } e/o { oreLavoro } presenti:
 *     1. Legge tariffa oraria da Parametri Configurazione
 *     2. Calcola importo totale
 *     3. Crea record in Costi Strutture
 *     4. Aggiorna Stato → "Completata"
 *     5. Notifica canale Teams + richiedente
 *
 * [id] = spItemId (ID stringa item SharePoint)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  getRichiestaById,
  aggiornaRichiesta,
  getParametro,
  creaCosto,
  getSPUserEmailByLookupId,
} from '@/lib/sharepoint'
import {
  notificaTecnicoAssegnato,
  notificaChiusuraTicket,
} from '@/lib/notifications'
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

      return NextResponse.json({ ok: true, stato: 'In lavorazione' })
    }

    // ---- CASO B: chiusura ticket ----
    const hasImporto = body.importoFattura != null && body.importoFattura > 0
    const hasOre = body.oreLavoro != null && body.oreLavoro > 0

    if (hasImporto || hasOre) {
      if (richiesta.stato === 'Completata') {
        return NextResponse.json(
          { error: 'Richiesta già completata' },
          { status: 409 }
        )
      }

      // Calcola importo totale (come Flusso 2C)
      let costoOre = 0
      if (hasOre) {
        const tariffa = await getParametro('Costo orario pulizie')
        costoOre = (body.oreLavoro ?? 0) * tariffa
      }
      const importoTotale = (body.importoFattura ?? 0) + costoOre

      // Remap categoria: "Guasto urgente" → "Manutenzione straordinaria"
      const categoria =
        richiesta.tipoIntervento === 'Guasto urgente'
          ? 'Manutenzione straordinaria'
          : richiesta.tipoIntervento

      // Periodo in italiano (es. "giugno 2026")
      const periodo = new Date().toLocaleDateString('it-IT', {
        month: 'long',
        year: 'numeric',
      })

      // Crea record in Costi Strutture
      await creaCosto({
        Title: richiesta.idRichiesta,
        DataCosto: new Date().toISOString(),
        Categoria: categoria,               // Choice → stringa semplice
        Importo: importoTotale,
        StrutturaLookupId: richiesta.struttura.id,  // Lookup → {Campo}LookupId
        Fornitore: richiesta.tecnico?.value ?? undefined,
        Periodo: periodo,
        Fonte: 'Manuale',                   // Choice → stringa semplice
      })

      // Aggiorna richiesta
      const updateFields: Record<string, unknown> = {
        Stato: 'Completata',                // Choice → stringa semplice
        Pagato: false,
        ...(hasImporto ? { ImportoFattura: body.importoFattura } : {}),
        ...(hasOre ? { OrePulizia: body.oreLavoro } : {}),   // SP internal name = OrePulizia ("Ore Lavoro Interno")
        ...(body.dataIntervento ? { DataIntervento: body.dataIntervento } : {}),
        ...(body.noteResponsabile ? { NoteDennis: body.noteResponsabile } : {}),
      }
      await aggiornaRichiesta(spItemId, updateFields)

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

      return NextResponse.json({ ok: true, stato: 'Completata', importoTotale })
    }

    // Aggiornamento generico (note, data intervento)
    const genericFields: Record<string, unknown> = {}
    if (body.noteResponsabile != null) genericFields.NoteDennis = body.noteResponsabile
    if (body.dataIntervento != null) genericFields.DataIntervento = body.dataIntervento
    if (Object.keys(genericFields).length > 0) {
      await aggiornaRichiesta(spItemId, genericFields)
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
