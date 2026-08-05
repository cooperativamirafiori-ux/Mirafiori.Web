/**
 * GET  /api/permessi        — elenco di tutte le autorizzazioni
 * POST /api/permessi        — concede un'area a un utente { utente, area }
 *
 * Protette: solo chi ha il permesso "Amministrazione".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import {
  getTutteAutorizzazioni,
  aggiungiAutorizzazione,
  AREE_PERMESSI,
} from '@/lib/sharepoint'
import { logAzione } from '@/lib/core/audit'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function GET() {
  const g = await guardArea('Amministrazione')
  if (g.error) return g.error
  try {
    const autorizzazioni = await getTutteAutorizzazioni()
    return NextResponse.json({ autorizzazioni, aree: AREE_PERMESSI })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore lettura permessi' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const g = await guardArea('Amministrazione')
  if (g.error) return g.error

  let body: { utente?: string; area?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const utente = (body.utente ?? '').toLowerCase().trim()
  const area = (body.area ?? '').trim()
  if (!EMAIL_RE.test(utente)) {
    return NextResponse.json({ error: 'Email non valida' }, { status: 400 })
  }
  if (!area) {
    return NextResponse.json({ error: 'Area mancante' }, { status: 400 })
  }

  try {
    const creata = await aggiungiAutorizzazione(utente, area)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'permesso.concedi',
      entita: 'Autorizzazione',
      entitaId: creata.id,
      dettagli: { utenteTarget: utente, area },
    })
    return NextResponse.json({ autorizzazione: creata })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore salvataggio' },
      { status: 500 }
    )
  }
}
