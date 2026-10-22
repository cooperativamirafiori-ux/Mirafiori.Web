/**
 * Parametri del calcolatore Preventivi Catering (€/km, €/ora, coperto, IVA).
 *
 * GET  — chi entra nei Preventivi
 * PUT  — solo chi ha "Amministrazione" (o admin)
 */

import { NextResponse } from 'next/server'
import { logAzione } from '@/lib/core/audit'
import { guardPreventivi, leggiCorpo, rispostaErrore } from '@/lib/preventivi/guard'
import { leggiParametriCateringSP, salvaParametriCateringSP } from '@/lib/preventivi/catering'
import { leggiParametriCatering } from '@/lib/preventivi/catering-calcoli'

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardPreventivi({ senzaListe: true })
  if (g.error) return g.error
  return NextResponse.json(await leggiParametriCateringSP())
}

export async function PUT(req: Request) {
  const g = await guardPreventivi({ senzaListe: true, soloTutti: true })
  if (g.error) return g.error
  const b = await leggiCorpo(req)
  if (!b) return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  const letto = leggiParametriCatering(b)
  if ('problemi' in letto) return NextResponse.json({ error: letto.problemi.join(' · ') }, { status: 400 })
  try {
    const prima = (await leggiParametriCateringSP()).parametri
    const parametri = await salvaParametriCateringSP(letto.dati)
    await logAzione({
      utente: g.email,
      nome: g.nome,
      azione: 'preventivi.catering_parametri',
      entita: 'Parametri',
      dettagli: { prima, dopo: parametri },
    })
    return NextResponse.json({ parametri })
  } catch (e) {
    return rispostaErrore(e, 500)
  }
}
