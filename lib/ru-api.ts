/**
 * Factory di handler per le API route dell'area Risorse Umane.
 * Ogni entità (dipendenti/collaboratori/tirocini) ha le stesse operazioni CRUD,
 * quindi i route file si limitano a:
 *
 *   export const { GET, POST } = listHandlers('dipendenti')
 *
 * Tutte le route sono protette dal permesso "Risorse Umane".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/api-guard'
import {
  getItems,
  getItem,
  creaItem,
  aggiornaItem,
  eliminaItem,
  validaInput,
} from '@/lib/risorse-umane'
import type { RUEntity } from '@/types/risorse-umane'

export const AREA_RU = 'Risorse Umane'

function errore(e: unknown, fallback: string, status = 500) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : fallback },
    { status },
  )
}

export function listHandlers(entity: RUEntity) {
  async function GET() {
    const g = await guardArea(AREA_RU)
    if (g.error) return g.error
    try {
      const items = await getItems(entity)
      return NextResponse.json({ items })
    } catch (e) {
      return errore(e, 'Errore lettura dati')
    }
  }

  async function POST(req: NextRequest) {
    const g = await guardArea(AREA_RU)
    if (g.error) return g.error
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
    }
    const msg = validaInput(body)
    if (msg) return NextResponse.json({ error: msg }, { status: 400 })
    try {
      const item = await creaItem(entity, body)
      return NextResponse.json({ item })
    } catch (e) {
      return errore(e, 'Errore salvataggio')
    }
  }

  return { GET, POST }
}

export function itemHandlers(entity: RUEntity) {
  async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const g = await guardArea(AREA_RU)
    if (g.error) return g.error
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })
    try {
      const item = await getItem(entity, id)
      return NextResponse.json({ item })
    } catch (e) {
      return errore(e, 'Errore lettura')
    }
  }

  async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const g = await guardArea(AREA_RU)
    if (g.error) return g.error
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
    }
    const msg = validaInput(body)
    if (msg) return NextResponse.json({ error: msg }, { status: 400 })
    try {
      const item = await aggiornaItem(entity, id, body)
      return NextResponse.json({ item })
    } catch (e) {
      return errore(e, 'Errore aggiornamento')
    }
  }

  async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const g = await guardArea(AREA_RU)
    if (g.error) return g.error
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })
    try {
      await eliminaItem(entity, id)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return errore(e, 'Errore eliminazione')
    }
  }

  return { GET, PATCH, DELETE }
}
