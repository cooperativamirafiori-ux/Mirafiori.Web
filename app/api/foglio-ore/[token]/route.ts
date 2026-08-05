/**
 * POST /api/foglio-ore/[token]   body: { esito: 'conferma' | 'errore', note? }
 *
 * Risposta del dipendente al foglio ore validato, dal link ricevuto per mail.
 * NON richiede login: la persona ci arriva dal telefono, e obbligarla a
 * autenticarsi per dire "si, e' corretto" farebbe morire il flusso.
 *
 * Il token e' un segreto monouso: alla conferma viene azzerato, cosi' il link
 * non resta valido per sempre nella casella di posta.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getChiusuraByToken } from '@/lib/timbrature'
import { confermaFoglio, contestaFoglio } from '@/lib/timbrature-flusso'
import { logAzione } from '@/lib/core/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const esito = String(body?.esito ?? '')
  if (esito !== 'conferma' && esito !== 'errore') {
    return NextResponse.json({ error: 'Esito non valido' }, { status: 400 })
  }
  const note = String(body?.note ?? '').trim()
  if (esito === 'errore' && !note) {
    return NextResponse.json({ error: 'Scrivi che cosa non torna: serve al responsabile per correggere.' }, { status: 400 })
  }

  const trovato = await getChiusuraByToken(token)
  if (!trovato) return NextResponse.json({ error: 'Link non valido o gia utilizzato.' }, { status: 404 })
  const { chiusura, dipendente } = trovato

  try {
    const res =
      esito === 'conferma'
        ? await confermaFoglio(dipendente.id, chiusura.anno, chiusura.mese, dipendente.email)
        : await contestaFoglio(dipendente.id, chiusura.anno, chiusura.mese, note)
    if (!res.ok) return NextResponse.json({ error: res.motivo }, { status: 409 })

    await logAzione({
      utente: dipendente.email,
      nome: dipendente.cognomeNome,
      azione: esito === 'conferma' ? 'timbrature.conferma-dipendente' : 'timbrature.contestazione',
      entita: 'FoglioOre',
      entitaId: `${dipendente.id}/${chiusura.anno}-${chiusura.mese}`,
      dettagli: { note: note || undefined, ip: req.headers.get('x-forwarded-for') ?? undefined },
    })
    return NextResponse.json({ ok: true, stato: res.chiusura?.stato })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}
