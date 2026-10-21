/**
 * POST /api/prestazioni/[spItemId]/annulla
 *
 * Annulla una pratica salvata ma mai proseguita (21 ott 2026).
 * - consentito SOLO in "Bozza": dopo l'invio a DocuSign servirebbe anche
 *   ritirare la busta, per ora non previsto;
 * - il record NON si cancella: passa a "Annullata" (traccia + numerazione
 *   PREST-AAAA-NNN senza buchi) e sparisce dalle attive;
 * - la sottocartella `Prestazione_{data}` si cancella solo se vuota; i
 *   documenti d'identità del prestatore restano;
 * - lo può fare il responsabile che l'ha aperta o un amministratore.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import {
  getPrestazioneById,
  aggiornaPrestazione,
  eliminaCartellaPrestazioneSeVuota,
} from '@/lib/prestazioni/data'
import { puoGestirePratica } from '@/lib/prestazioni/accesso'
import { logAzione } from '@/lib/core/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ spItemId: string }> },
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  const { spItemId } = await params

  try {
    const p = await getPrestazioneById(spItemId)
    if (!puoGestirePratica(session.user, p)) {
      return NextResponse.json(
        { error: 'Può annullarla solo chi ha aperto la pratica o un amministratore.' },
        { status: 403 },
      )
    }
    if (p.stato === 'Annullata') return NextResponse.json({ ok: true, stato: 'Annullata' })
    if (p.stato !== 'Bozza') {
      return NextResponse.json(
        { error: 'Si può annullare solo una pratica in Bozza (prima dell’invio dei documenti in firma).' },
        { status: 409 },
      )
    }

    await aggiornaPrestazione(spItemId, { Stato: 'Annullata' })

    let cartellaCancellata = false
    try {
      cartellaCancellata = await eliminaCartellaPrestazioneSeVuota({
        nome: p.nome,
        cognome: p.cognome,
        codiceFiscale: p.codiceFiscale,
        dataCartella: p.dataInserimento,
      })
    } catch (e) {
      console.error('[prestazioni/annulla] pulizia cartella fallita (pratica già annullata)', e)
    }

    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: 'prestazione.annulla',
      entita: 'PrestazioneOccasionale',
      entitaId: p.idPrestazione,
      dettagli: { prestatore: `${p.cognome} ${p.nome}`.trim(), cartellaCancellata },
    })

    return NextResponse.json({ ok: true, stato: 'Annullata', cartellaCancellata })
  } catch (err: any) {
    console.error('[POST /api/prestazioni/[spItemId]/annulla]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
