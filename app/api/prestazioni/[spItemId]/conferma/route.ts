/**
 * POST /api/prestazioni/[spItemId]/conferma
 *
 * Chiude il salvataggio di una nuova prestazione: invia la mail di riepilogo e
 * scrive nel log delle attività. Va chiamata dal client dopo che i documenti
 * d'identità sono stati caricati direttamente su SharePoint.
 *
 * Sta in una route separata perché la mail non deve partire se il caricamento
 * dei documenti si interrompe a metà.
 *
 * Body JSON: { documentiCaricati?: string[] }  (solo per il log)
 * Risposta:  { ok: true }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { getPrestazioneById } from '@/lib/prestazioni/data'
import { notificaRiepilogoPrestazione } from '@/lib/prestazioni/notifiche'
import { logAzione } from '@/lib/core/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> },
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const { spItemId } = await params
  if (!spItemId) {
    return NextResponse.json({ error: 'ID prestazione mancante' }, { status: 400 })
  }

  let documentiCaricati: string[] = []
  try {
    const body = await req.json()
    if (Array.isArray(body?.documentiCaricati)) documentiCaricati = body.documentiCaricati
  } catch {
    // body opzionale
  }

  try {
    const p = await getPrestazioneById(spItemId)

    await notificaRiepilogoPrestazione({
      idPrestazione: p.idPrestazione,
      nome: p.nome,
      cognome: p.cognome,
      dataNascita: p.dataNascita,
      luogoNascita: p.luogoNascita,
      codiceFiscale: p.codiceFiscale,
      residenza: p.residenza,
      ruolo: p.ruolo,
      email: p.email,
      telefono: p.telefono,
      iban: p.iban,
      giorni: p.giorni,
      dataInizio: p.dataInizio,
      dataFine: p.dataFine,
      attivita: p.attivita,
      compensoPrevisto: p.compensoPrevisto,
      responsabileNome: p.responsabileNome,
      responsabileEmail: p.responsabileEmail,
      cartellaUrl: p.cartellaUrl,
    }).catch((e) => console.error('[prestazioni] invio riepilogo fallito', e))

    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: 'prestazione.crea',
      entita: 'PrestazioneOccasionale',
      entitaId: p.idPrestazione,
      dettagli: {
        prestatore: `${p.cognome} ${p.nome}`.trim(),
        ruolo: p.ruolo,
        ...(documentiCaricati.length ? { documenti: documentiCaricati.join(', ') } : {}),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[POST /api/prestazioni/[spItemId]/conferma]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
