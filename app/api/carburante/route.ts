/**
 * Carburante — fatture IP divise fra i centri di costo (docs/carburante.md).
 *
 *   GET    ?fattura=<id>  → dettaglio: quote, rifornimenti, nota
 *   GET                   → ultimi file letti dalla cartella
 *   POST   { ids }        → segna le fatture come carburante (e ricorda il fornitore), poi divide
 *   DELETE { ids }        → toglie il carburante
 *   PUT                   → legge adesso la cartella e ridivide ("Leggi adesso")
 *
 * Il dettaglio lo vede chi entra in "Fatture del servizio"; segnare, togliere e
 * leggere solo chi vede tutto (permesso Controllo di Gestione o Pagamenti).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { logAzione } from '@/lib/core/audit'
import { accessoAssegnazione, puoAssegnare } from '@/lib/pagamenti/assegnazione'
import {
  aggiornaCarburante,
  dettaglioCarburante,
  ricalcolaCarburante,
  segnaCarburante,
  togliCarburante,
  ultimiFile,
} from '@/lib/carburante/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function guard(serveTutto: boolean) {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { error: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) } as const
  const accesso = await accessoAssegnazione(session.user)
  if (!puoAssegnare(accesso) || (serveTutto && !accesso.tutti)) {
    return {
      error: NextResponse.json(
        { error: serveTutto ? 'Serve il permesso Controllo di Gestione o Pagamenti' : 'Accesso negato' },
        { status: 403 },
      ),
    } as const
  }
  return { session, email, error: null } as const
}

const ids = (b: unknown): string[] => {
  const v = (b as { ids?: unknown })?.ids
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 200) : []
}

const errore = (e: unknown, status = 500) =>
  NextResponse.json({ error: e instanceof Error ? e.message : 'Operazione non riuscita' }, { status })

export async function GET(req: NextRequest) {
  const g = await guard(false)
  if (g.error) return g.error
  try {
    const id = req.nextUrl.searchParams.get('fattura')
    if (id) return NextResponse.json(await dettaglioCarburante(id))
    return NextResponse.json({ file: await ultimiFile() })
  } catch (e) {
    return errore(e)
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(true)
  if (g.error) return g.error
  let lista: string[]
  try {
    lista = ids(await req.json())
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  if (!lista.length) return NextResponse.json({ error: 'Nessuna fattura indicata' }, { status: 400 })
  try {
    const segnate = await segnaCarburante(lista, g.email)
    const r = await ricalcolaCarburante()
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'fatture.carburante',
      entita: 'FatturaPassiva',
      entitaId: lista.length === 1 ? lista[0] : null,
      dettagli: { ids: lista, segnate, ...r },
    })
    return NextResponse.json({ segnate, ...r })
  } catch (e) {
    return errore(e, 400)
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard(true)
  if (g.error) return g.error
  let lista: string[]
  try {
    lista = ids(await req.json())
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  if (!lista.length) return NextResponse.json({ error: 'Nessuna fattura indicata' }, { status: 400 })
  try {
    const tolte = await togliCarburante(lista)
    await ricalcolaCarburante()
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'fatture.togli_carburante',
      entita: 'FatturaPassiva',
      entitaId: lista.length === 1 ? lista[0] : null,
      dettagli: { ids: lista, tolte },
    })
    return NextResponse.json({ tolte })
  } catch (e) {
    return errore(e, 400)
  }
}

export async function PUT() {
  const g = await guard(true)
  if (g.error) return g.error
  try {
    const r = await aggiornaCarburante()
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'carburante.leggi_cartella',
      entita: 'Carburante',
      dettagli: { ...r, file: r.file.filter((f) => f.esito !== 'invariato') },
    })
    return NextResponse.json(r)
  } catch (e) {
    return errore(e)
  }
}
