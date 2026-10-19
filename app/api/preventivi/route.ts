/**
 * Preventivi.
 *
 *   GET  → { preventivi, accesso } — solo quelli dei centri di costo che si
 *          coordinano; tutti per chi ha "Amministrazione"
 *   POST {dati} → crea una bozza
 *
 * Accesso: lib/preventivi/accesso.ts. Piano: docs/preventivi.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPreventivi, leggiCorpo, rispostaErrore } from '@/lib/preventivi/guard'
import { vedeCentro } from '@/lib/preventivi/accesso'
import { getPreventivi } from '@/lib/preventivi/data'
import { crea } from '@/lib/preventivi/azioni'
import { leggiDati } from '@/lib/preventivi/flusso'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardPreventivi()
  if (g.error) return g.error
  try {
    const preventivi = (await getPreventivi()).filter((p) => vedeCentro(g.accesso, p.ccCodice))
    return NextResponse.json({ preventivi, accesso: g.accesso })
  } catch (e) {
    return rispostaErrore(e, 500)
  }
}

export async function POST(req: NextRequest) {
  const g = await guardPreventivi()
  if (g.error) return g.error
  const b = await leggiCorpo(req)
  if (!b) return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  const letto = leggiDati(b)
  if ('problemi' in letto) return NextResponse.json({ error: letto.problemi.join(' · ') }, { status: 400 })
  try {
    const preventivo = await crea(letto.dati, g.accesso, { email: g.email, nome: g.nome })
    // Nel log niente nome del ragazzo: solo servizio ed ente.
    await logAzione({
      utente: g.email,
      nome: g.nome,
      azione: 'preventivi.crea',
      entita: 'Preventivo',
      entitaId: preventivo.spItemId,
      dettagli: { cc: preventivo.ccCodice, ente: preventivo.destinatario.ente, modello: preventivo.modello },
    })
    return NextResponse.json({ preventivo })
  } catch (e) {
    return rispostaErrore(e)
  }
}
