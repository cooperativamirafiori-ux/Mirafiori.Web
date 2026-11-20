/**
 * Enti dei preventivi (20/11/2026).
 *
 *   GET            → { enti } — li vede chi fa preventivi
 *   POST {nome, servizi, note} → nuovo ente: lo può aggiungere chi fa
 *                    preventivi (un ente nuovo capita mentre si scrive)
 *
 * Regole: lib/preventivi/enti.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPreventivi, leggiCorpo, rispostaErrore } from '@/lib/preventivi/guard'
import { entiConfigurati, getEnti } from '@/lib/preventivi/data'
import { leggiEnte, nuovoEnte } from '@/lib/preventivi/enti'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

const nonConfigurata = () =>
  NextResponse.json({ error: 'Lista Enti non ancora creata: lancia scripts/provision-preventivi.mjs' }, { status: 503 })

export async function GET() {
  const g = await guardPreventivi()
  if (g.error) return g.error
  try {
    return NextResponse.json({ enti: await getEnti(), configurata: entiConfigurati(), accesso: g.accesso })
  } catch (e) {
    return rispostaErrore(e, 500)
  }
}

export async function POST(req: NextRequest) {
  const g = await guardPreventivi()
  if (g.error) return g.error
  if (!entiConfigurati()) return nonConfigurata()
  const b = await leggiCorpo(req)
  if (!b) return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  const letto = leggiEnte(b)
  if ('problema' in letto) return NextResponse.json({ error: letto.problema }, { status: 400 })
  try {
    const ente = await nuovoEnte(letto)
    await logAzione({ utente: g.email, nome: g.nome, azione: 'preventivi.ente_nuovo', entita: 'EntePreventivi', entitaId: ente.spItemId, dettagli: { nome: ente.nome } })
    return NextResponse.json({ ente })
  } catch (e) {
    return rispostaErrore(e)
  }
}
