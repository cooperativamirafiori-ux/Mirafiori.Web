/**
 * GET  /api/software   — elenco di tutti i software
 * POST /api/software   — crea un nuovo software
 *
 * Protette: solo chi ha il permesso "Amministrazione".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { getSoftware, creaSoftware } from '@/lib/software'
import { logAzione } from '@/lib/core/audit'
import type { SoftwareInput } from '@/types/software'

export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'

function parseInput(body: Record<string, any>) {
  const servizio = (body.servizio ?? '').trim()
  const costoNum =
    body.costo === '' || body.costo == null ? null : Number(body.costo)
  return {
    servizio,
    categoria: (body.categoria ?? '').trim(),
    account: (body.account ?? '').trim(),
    password: body.password ?? '',
    linkPortale: (body.linkPortale ?? '').trim(),
    referente: (body.referente ?? '').trim(),
    costo: Number.isFinite(costoNum) ? costoNum : null,
    periodicita: (body.periodicita ?? '').trim(),
    rinnovoAutomatico: !!body.rinnovoAutomatico,
    scadenza: (body.scadenza ?? '') || null,
    cartaPagamento: (body.cartaPagamento ?? '').trim(),
    stato: (body.stato ?? 'Attivo').trim() || 'Attivo',
    note: (body.note ?? '').trim(),
    calendarEmails: (body.calendarEmails ?? '').trim(),
  }
}

export async function GET() {
  const g = await guardArea(AREA)
  if (g.error) return g.error
  try {
    const software = await getSoftware()
    return NextResponse.json({ software })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore lettura software' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const g = await guardArea(AREA)
  if (g.error) return g.error

  let body: Partial<SoftwareInput>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const input = parseInput(body)
  if (!input.servizio) {
    return NextResponse.json({ error: 'Il nome del servizio è obbligatorio' }, { status: 400 })
  }

  try {
    const software = await creaSoftware(input)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'software.crea',
      entita: 'Software',
      entitaId: software.spItemId,
      dettagli: { servizio: software.servizio },
    })
    return NextResponse.json({ software })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore salvataggio' },
      { status: 500 },
    )
  }
}
