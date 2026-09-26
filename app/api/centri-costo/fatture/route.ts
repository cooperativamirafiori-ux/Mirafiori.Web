/**
 * Fatture da segnare per centro di costo.
 *
 *   GET    → { libere, segnate, centri } per chi guarda
 *   POST   { ids, cc } → segna (vince il primo)
 *   DELETE { ids }     → libera (solo se non pagata dopo la segnatura, salvo CdG)
 *   PATCH  { id, cc }  → sposta o toglie (cc null), qualunque fattura: solo CdG/Pagamenti
 *
 * Accesso: coordinatore di almeno un centro di costo, oppure permesso
 * "Controllo di Gestione" o "Pagamenti". Regole in lib/pagamenti/assegnazione.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { accessoAssegnazione, fattureLibere, fattureSegnate, libera, puoAssegnare, segna, sposta } from '@/lib/pagamenti/assegnazione'
import { getCentriDiCosto } from '@/lib/centri-costo/data'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

async function guard() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) } as const
  const accesso = await accessoAssegnazione(session.user)
  if (!puoAssegnare(accesso)) return { error: NextResponse.json({ error: 'Accesso negato' }, { status: 403 }) } as const
  return { session, email, accesso, error: null } as const
}

const ids = (b: unknown): string[] => {
  const v = (b as { ids?: unknown })?.ids
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 200) : []
}

export async function GET() {
  const g = await guard()
  if (g.error) return g.error
  try {
    const [libere, segnate, tutti] = await Promise.all([fattureLibere(), fattureSegnate(g.accesso), getCentriDiCosto()])
    const centri = tutti
      .filter((c) => c.codice && (g.accesso.tutti || g.accesso.codici.includes(c.codice.toLowerCase())))
      .map((c) => ({ codice: c.codice.toLowerCase(), nome: c.nome }))
    const nomi = Object.fromEntries(tutti.filter((c) => c.codice).map((c) => [c.codice.toLowerCase(), c.nome]))
    return NextResponse.json({ libere, segnate, centri, nomi, tutti: g.accesso.tutti })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore di lettura' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  let b: unknown
  try {
    b = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const lista = ids(b)
  const cc = (b as { cc?: unknown })?.cc
  if (lista.length === 0 || typeof cc !== 'string') {
    return NextResponse.json({ error: 'Servono le fatture e il centro di costo' }, { status: 400 })
  }
  try {
    const r = await segna(lista, cc, g.email, g.accesso)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'fatture.segna_cc',
      entita: 'FatturaPassiva',
      entitaId: lista.length === 1 ? lista[0] : null,
      dettagli: { ids: lista, cc, ...r },
    })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Operazione non riuscita' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  let b: unknown
  try {
    b = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const lista = ids(b)
  if (lista.length === 0) return NextResponse.json({ error: 'Nessuna fattura indicata' }, { status: 400 })
  try {
    const r = await libera(lista, g.accesso)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'fatture.libera_cc',
      entita: 'FatturaPassiva',
      entitaId: lista.length === 1 ? lista[0] : null,
      dettagli: { ids: lista, ...r },
    })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Operazione non riuscita' }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  let b: { id?: unknown; cc?: unknown }
  try {
    b = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  if (typeof b.id !== 'string' || !b.id) return NextResponse.json({ error: 'Fattura non indicata' }, { status: 400 })
  const cc = typeof b.cc === 'string' && b.cc ? b.cc : null
  try {
    await sposta(b.id, cc, g.email, g.accesso)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'fatture.sposta_cc',
      entita: 'FatturaPassiva',
      entitaId: b.id,
      dettagli: { cc },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Operazione non riuscita' }, { status: 400 })
  }
}
