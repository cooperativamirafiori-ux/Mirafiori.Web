/**
 * GET    /api/timbrature/hr/profilo?dipendenteId=N  — storico variazioni orario
 * POST   /api/timbrature/hr/profilo                 — registra una variazione
 * DELETE /api/timbrature/hr/profilo?id=N&dipendenteId=M — cancella una variazione
 *
 * Solo HR. Il monte ore settimanale determina le ore attese di ogni giornata, e
 * quindi la completezza, i solleciti, lo scostamento e la flessibilita': una
 * variazione registrata con la decorrenza sbagliata riscrive in silenzio le ore
 * attese dei mesi passati. Per questo qui si tiene lo STORICO, con il motivo e
 * la lettera firmata, e si puo' cancellare una riga sbagliata: senza
 * cancellazione l'errore resterebbe per sempre, perche' il salvataggio e'
 * idempotente sulla data e quella giusta non sostituisce quella sbagliata.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardHr } from '@/lib/timbrature/guard'
import {
  eliminaProfilo,
  getProfili,
  getProfiloById,
  leggiVariazione,
  salvaProfilo,
} from '@/lib/timbrature/data'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await guardHr()
  if (g.error) return g.error
  const dipendenteId = Number(new URL(req.url).searchParams.get('dipendenteId'))
  if (!dipendenteId) return NextResponse.json({ error: 'dipendenteId obbligatorio' }, { status: 400 })
  try {
    const profili = await getProfili(dipendenteId)
    return NextResponse.json({ profili })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await guardHr()
  if (g.error) return g.error
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const v = leggiVariazione(body)
  if (!v.dipendenteId || !/^\d{4}-\d{2}-\d{2}$/.test(v.decorrenza)) {
    return NextResponse.json({ error: 'dipendenteId e decorrenza (YYYY-MM-DD) obbligatori' }, { status: 400 })
  }
  const settimanali = Object.values(v.ore).reduce((s, n) => s + n, 0)
  if (settimanali <= 0) {
    return NextResponse.json(
      { error: 'Il monte ore settimanale non puo\' essere zero: indica le ore di almeno un giorno.' },
      { status: 400 },
    )
  }

  try {
    const profilo = await salvaProfilo({
      dipendenteId: v.dipendenteId,
      decorrenza: v.decorrenza,
      ore: v.ore,
      aggiornatoDa: g.session.user.email!,
      motivo: v.motivo,
      file: v.file,
    })
    await logAzione({
      utente: g.session.user.email!,
      nome: g.session.user.name,
      azione: 'timbrature.variazione-orario',
      entita: 'ProfiloOrario',
      entitaId: String(profilo.id),
      dettagli: {
        dipendenteId: v.dipendenteId,
        decorrenza: v.decorrenza,
        oreSettimanali: settimanali,
        motivo: v.motivo,
        conAllegato: !!v.file,
      },
    })
    return NextResponse.json({ profilo })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore salvataggio' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guardHr()
  if (g.error) return g.error
  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get('id'))
  const dipendenteId = Number(searchParams.get('dipendenteId'))
  if (!id || !dipendenteId) {
    return NextResponse.json({ error: 'id e dipendenteId obbligatori' }, { status: 400 })
  }
  try {
    const prima = await getProfiloById(id)
    if (!prima || prima.dipendenteId !== dipendenteId) {
      return NextResponse.json({ error: 'Variazione non trovata' }, { status: 404 })
    }
    await eliminaProfilo(dipendenteId, id)
    await logAzione({
      utente: g.session.user.email!,
      nome: g.session.user.name,
      azione: 'timbrature.variazione-orario-eliminata',
      entita: 'ProfiloOrario',
      entitaId: String(id),
      dettagli: { dipendenteId, decorrenza: prima.decorrenza },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore eliminazione' }, { status: 400 })
  }
}
