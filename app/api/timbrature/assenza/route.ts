/**
 * POST   /api/timbrature/assenza  — inserisce un'assenza su un periodo
 * DELETE /api/timbrature/assenza  — la toglie dallo stesso periodo
 *   body: { servizioId, dal, al, dipendenteId? }
 *
 * Serve perche' due settimane di ferie non si inseriscono aprendo quattordici
 * giornate una per una. Solo giornate intere: per prendere qualche ora si va sul
 * singolo giorno, dove si scelgono gli orari.
 *
 * Una sola route per due mestieri, distinti da `dipendenteId`:
 *   - assente  → il dipendente agisce su di se' (finestra e stato del mese suoi);
 *   - presente → un responsabile o le HR agiscono PER CONTO di quella persona,
 *     e allora vale il controllo `puoAgireSu`.
 * Sono la stessa funzione, non due: chi inserisce le ferie di un collaboratore
 * fa esattamente la cosa che fa il collaboratore.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardOperatore, guardValidatore, puoAgireSu } from '@/lib/timbrature/guard'
import { creaAssenzaPeriodo, eliminaAssenzaPeriodo } from '@/lib/timbrature/data'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

const YMD = /^\d{4}-\d{2}-\d{2}$/

interface Richiesta {
  servizioId: number
  dal: string
  al: string
  dipendenteId: number | null
}

function leggi(body: any): Richiesta | string {
  const servizioId = Number(body?.servizioId)
  const dal = String(body?.dal ?? '').slice(0, 10)
  const al = String(body?.al ?? '').slice(0, 10)
  if (!servizioId) return 'Scegli la voce da inserire'
  if (!YMD.test(dal) || !YMD.test(al)) return 'Indica il primo e l\'ultimo giorno del periodo'
  if (al < dal) return 'L\'ultimo giorno e\' precedente al primo'
  const dipendenteId = body?.dipendenteId ? Number(body.dipendenteId) : null
  return { servizioId, dal, al, dipendenteId }
}

/**
 * Risolve chi scrive e su chi. Restituisce l'id del dipendente interessato,
 * l'identita' di chi firma la scrittura e se e' una scrittura per conto terzi.
 */
async function risolviAttore(dipendenteId: number | null) {
  if (dipendenteId) {
    const g = await guardValidatore()
    if (g.error) return { error: g.error }
    const negato = await puoAgireSu(g.v, dipendenteId)
    if (negato) return { error: NextResponse.json({ error: negato }, { status: 403 }) }
    return { dipendenteId, chi: g.v.email, nome: g.v.session.user.name, perConto: true }
  }
  const g = await guardOperatore()
  if (g.error) return { error: g.error }
  return {
    dipendenteId: g.dipendente.id,
    chi: g.session.user.email!,
    nome: g.session.user.name,
    perConto: false,
  }
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const r = leggi(body)
  if (typeof r === 'string') return NextResponse.json({ error: r }, { status: 400 })

  const a = await risolviAttore(r.dipendenteId)
  if ('error' in a) return a.error

  try {
    const esito = await creaAssenzaPeriodo(a.dipendenteId, r.servizioId, r.dal, r.al, a.chi, {
      perConto: a.perConto,
    })
    if (a.perConto && esito.inserite.length) {
      await logAzione({
        utente: a.chi,
        nome: a.nome,
        azione: 'timbrature.assenza-periodo-per-conto',
        entita: 'Timbratura',
        entitaId: String(a.dipendenteId),
        dettagli: { dal: r.dal, al: r.al, servizioId: r.servizioId, giorni: esito.inserite.length },
      })
    }
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore salvataggio' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const r = leggi(body)
  if (typeof r === 'string') return NextResponse.json({ error: r }, { status: 400 })

  const a = await risolviAttore(r.dipendenteId)
  if ('error' in a) return a.error

  try {
    const esito = await eliminaAssenzaPeriodo(a.dipendenteId, r.servizioId, r.dal, r.al, {
      perConto: a.perConto,
    })
    return NextResponse.json(esito)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore eliminazione' }, { status: 400 })
  }
}
