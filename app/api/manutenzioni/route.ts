/**
 * POST /api/manutenzioni — Crea nuova richiesta
 *
 * Replica logica Flusso 2A:
 *   1. Crea item su SP con Stato="Aperta"
 *   2. Genera ID MAN-YYYY-{NumericId:000} e aggiorna Title
 *   3. Invia DM Teams all'admin
 *   4. Se urgente → invia email
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { creaRichiesta, aggiornaRichiesta } from '@/lib/manutenzioni/data'
import { getSPUserLookupId } from '@/lib/core/sp'
import { notificaNuovaRichiesta } from '@/lib/manutenzioni/notifiche'
import { logAzione } from '@/lib/core/audit'
import type { NuovaRichiestaPayload } from '@/types/manutenzioni'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  let body: NuovaRichiestaPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { strutturaId, strutturaNome, tipoIntervento, priorita, descrizione } = body

  if (!strutturaId || !tipoIntervento || !priorita || !descrizione?.trim()) {
    return NextResponse.json({ error: 'Campi obbligatori mancanti' }, { status: 400 })
  }

  try {
    // 0. Recupera il lookup ID SP dell'utente (necessario per Person column via Graph)
    const richiedenteLookupId = await getSPUserLookupId(session.user.email)

    // 1. Crea l'item su SharePoint
    const { id: spItemId, numericId } = await creaRichiesta({
      StrutturaId: Number(strutturaId),
      RichiedenteLookupId: richiedenteLookupId,
      TipoIntervento: tipoIntervento,
      Priorita: priorita,
      Descrizione: descrizione,
      Stato: 'Aperta',
    })

    // 2. Genera ID progressivo MAN-YYYY-XXX e aggiorna Title
    const anno = new Date().getFullYear()
    const idRichiesta = `MAN-${anno}-${String(numericId).padStart(3, '0')}`
    await aggiornaRichiesta(spItemId, {
      Title: idRichiesta,
      DataRichiesta: new Date().toISOString(),
      Pagato: false,
    })

    // 3. Notifiche (async, non bloccanti — errori loggati in lib/notifications)
    const isUrgente = priorita === 'Urgente (esecuzione in giornata)'
    notificaNuovaRichiesta({
      idRichiesta,
      struttura: strutturaNome,
      richiedente: session.user.name ?? session.user.email,
      tipoIntervento,
      priorita,
      descrizione,
      isUrgente,
    }).catch(console.error)

    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: 'manutenzione.crea',
      entita: 'RichiestaManutenzione',
      entitaId: idRichiesta,
      dettagli: { struttura: strutturaNome, tipoIntervento, priorita },
    })

    return NextResponse.json({ idRichiesta, spItemId }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/manutenzioni]', err)
    return NextResponse.json(
      { error: err.message ?? 'Errore interno' },
      { status: 500 }
    )
  }
}
