/**
 * Coordinatori e responsabili d'area dei centri di costo.
 *
 *   GET                                     → { centri, mancanti }
 *   PATCH { tipo: 'coordinatori', codice, email[] } → elenco completo del centro
 *   PATCH { tipo: 'area', area, email[] }           → elenco completo dell'area
 *
 * L'elenco inviato SOSTITUISCE quello di prima: la schermata manda sempre
 * tutte le persone che vuole, non la differenza. Così due clic ravvicinati non
 * si pestano i piedi in modo strano: vince l'ultimo, e lo si vede.
 *
 * Accesso: permesso "Amministrazione". Nominare qualcuno gli apre i conti
 * Qonto del servizio, quindi è una scelta dell'amministrazione.
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import {
  colonneRuoliMancanti,
  getRuoliCentri,
  salvaCoordinatori,
  salvaResponsabiliArea,
} from '@/lib/centri-costo/data'

export const dynamic = 'force-dynamic'

const AREA = 'Amministrazione'
const EMAIL_RE = /^[^@\s;,]+@[^@\s;,]+\.[^@\s;,]+$/

function elencoEmail(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const email = v.map((x) => String(x ?? '').trim().toLowerCase())
  if (email.some((e) => !EMAIL_RE.test(e))) return null
  return [...new Set(email)].slice(0, 20)
}

export async function GET() {
  const g = await guardArea(AREA)
  if (g.error) return g.error
  try {
    const [centri, mancanti] = await Promise.all([getRuoliCentri(), colonneRuoliMancanti()])
    return NextResponse.json({ centri, mancanti })
  } catch (err) {
    console.error('[api/centri-costo/ruoli] GET', err)
    return NextResponse.json({ error: 'Lettura dei centri di costo non riuscita' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guardArea(AREA)
  if (g.error) return g.error
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const email = elencoEmail(body?.email)
  if (!body || !email) return NextResponse.json({ error: 'Elenco di email non valido' }, { status: 400 })

  try {
    const mancanti = await colonneRuoliMancanti()
    if (mancanti.length) {
      return NextResponse.json(
        { error: `Sulla lista mancano le colonne ${mancanti.join(', ')}: va lanciato prima lo script di allineamento.` },
        { status: 409 },
      )
    }

    if (body.tipo === 'coordinatori' && typeof body.codice === 'string') {
      const prima = (await getRuoliCentri()).find((r) => r.codice === body.codice)
      await salvaCoordinatori(body.codice, email)
      revalidateTag('centri-costo')
      await logAzione({
        utente: g.session.user.email,
        nome: g.session.user.name,
        azione: 'centri-costo.coordinatori',
        entita: 'CentroDiCosto',
        entitaId: body.codice,
        dettagli: { prima: prima?.coordinatori ?? [], dopo: email },
      })
    } else if (body.tipo === 'area' && typeof body.area === 'string' && body.area.trim()) {
      const prima = (await getRuoliCentri()).find((r) => r.area === body.area)
      const n = await salvaResponsabiliArea(body.area, email)
      revalidateTag('centri-costo')
      await logAzione({
        utente: g.session.user.email,
        nome: g.session.user.name,
        azione: 'centri-costo.responsabili-area',
        entita: 'AreaCentriDiCosto',
        entitaId: body.area,
        dettagli: { prima: prima?.responsabiliArea ?? [], dopo: email, centri: n },
      })
    } else {
      return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
    }

    const centri = await getRuoliCentri()
    return NextResponse.json({ centri, mancanti: [] })
  } catch (err) {
    console.error('[api/centri-costo/ruoli] PATCH', err)
    return NextResponse.json({ error: 'Salvataggio non riuscito: riprova fra un momento' }, { status: 500 })
  }
}
