/**
 * POST /api/consegna/[token] — conferma consegna senza login.
 *
 * Rotta pubblica (esclusa dal middleware): il richiedente arriva dal pulsante
 * nella mail. L'autorizzazione è il token, generato alla creazione della
 * richiesta e valido per quella sola richiesta.
 *
 * Deliberatamente POST e non GET: i client di posta e i sistemi di link-scanning
 * (Safe Links) seguono i link in GET, e una conferma partita da sola sarebbe
 * peggio di una conferma mancante. Dalla mail si apre una pagina, si conferma lì.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAcquistoByToken, acquistiConfigurato } from '@/lib/acquisti'
import { registraEsitoConsegna } from '@/lib/acquisti-flusso'
import { logAzione } from '@/lib/core/audit'
import { ESITI_CONSEGNA, type EsitoConsegna } from '@/types/acquisti'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!acquistiConfigurato()) {
    return NextResponse.json({ error: 'Sezione acquisti non configurata' }, { status: 503 })
  }

  let body: { esito?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const esito = body.esito
  if (!esito || !ESITI_CONSEGNA.includes(esito as EsitoConsegna)) {
    return NextResponse.json({ error: 'Esito non valido' }, { status: 400 })
  }

  try {
    const a = await getAcquistoByToken(token)
    if (!a) {
      return NextResponse.json({ error: 'Link non valido o scaduto' }, { status: 404 })
    }

    const res = await registraEsitoConsegna(a.spItemId, esito as EsitoConsegna, body.note)
    if (!res.ok) {
      return NextResponse.json({ error: res.motivo, stato: res.stato }, { status: 409 })
    }

    await logAzione({
      utente: null,
      nome: a.richiedenteNome,
      azione: 'acquisto.esito-da-mail',
      entita: 'RichiestaAcquisto',
      entitaId: a.codice,
      dettagli: { esito, via: 'link tokenizzato' },
    })

    return NextResponse.json({ ok: true, stato: res.stato, codice: a.codice })
  } catch (e: any) {
    console.error('[POST /api/consegna]', e)
    return NextResponse.json({ error: e?.message ?? 'Errore interno' }, { status: 500 })
  }
}
