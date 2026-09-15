/**
 * GET  /api/password   — elenco di tutte le voci della cassaforte
 * POST /api/password   — crea una nuova voce
 *
 * Protette: solo chi ha il permesso "Amministrazione".
 *
 * ⚠️ Nel log attività non finisce mai né la password né il PIN: si registra
 * che la voce è stata creata/modificata e il suo nome, non il contenuto.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import {
  getVociPassword,
  creaVocePassword,
  parseInputPassword,
} from '@/lib/password/data'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'

export async function GET() {
  const g = await guardArea(AREA)
  if (g.error) return g.error
  try {
    const voci = await getVociPassword()
    return NextResponse.json({ voci })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore lettura archivio password' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const g = await guardArea(AREA)
  if (g.error) return g.error

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const input = parseInputPassword(body)
  if (!input.nome) {
    return NextResponse.json({ error: 'Il nome della voce è obbligatorio' }, { status: 400 })
  }

  try {
    const voce = await creaVocePassword(input)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'password.crea',
      entita: 'VocePassword',
      entitaId: voce.spItemId,
      dettagli: { nome: voce.nome, categoria: voce.categoria },
    })
    return NextResponse.json({ voce })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore salvataggio' },
      { status: 500 },
    )
  }
}
