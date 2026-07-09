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
import { logAzione } from '@/lib/audit'
import { generaExportBuffer, nomeFileExport } from '@/lib/ru-export-xlsx'
import { RU_CONFIG, type RUEntity, type RURecord } from '@/types/risorse-umane'

export const AREA_RU = 'Risorse Umane'

/** Entità RU al singolare, per i codici azione del log (es. "ru.collaboratore.crea"). */
const ENTITA_SINGOLARE: Record<RUEntity, string> = {
  dipendenti: 'dipendente',
  collaboratori: 'collaboratore',
  tirocini: 'tirocinio',
}

/**
 * Nominativo leggibile del record per il log (nessun dato sensibile: solo
 * nome e cognome). Legge Title ("Cognome Nome") o ricompone da Cognome/Nome.
 */
function nominativoDa(src: Record<string, unknown> | null | undefined): string {
  if (!src) return ''
  const title = typeof src.Title === 'string' ? src.Title.trim() : ''
  if (title) return title
  const cognome = String(src.Cognome ?? '').trim()
  const nome = String(src.Nome ?? '').trim()
  return `${cognome} ${nome}`.trim()
}

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
      await logAzione({
        utente: g.session.user.email,
        nome: g.session.user.name,
        azione: `ru.${ENTITA_SINGOLARE[entity]}.crea`,
        entita: ENTITA_SINGOLARE[entity],
        entitaId: item.spItemId,
        dettagli: { nominativo: nominativoDa(item) || nominativoDa(body) },
      })
      return NextResponse.json({ item })
    } catch (e) {
      return errore(e, 'Errore salvataggio')
    }
  }

  return { GET, POST }
}

/**
 * Handler di esportazione Excel per un'entità RU.
 *
 *   export const { POST } = exportHandler('dipendenti')
 *
 * Body JSON:
 *   { fields: string[], ids?: string[] }
 * - `fields`: chiavi delle colonne da esportare (ordine preservato).
 * - `ids`:  spItemId dei record da includere, nell'ordine mostrato a video.
 *           Se assente, esporta TUTTI i record dell'entità.
 *
 * Risponde con lo stream .xlsx (allegato).
 */
export function exportHandler(entity: RUEntity) {
  async function POST(req: NextRequest) {
    const g = await guardArea(AREA_RU)
    if (g.error) return g.error

    let body: { fields?: unknown; ids?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
    }

    const validKeys = new Set(RU_CONFIG[entity].fields.map((f) => f.key))
    const fields = Array.isArray(body.fields)
      ? body.fields.filter((k): k is string => typeof k === 'string' && validKeys.has(k))
      : []
    if (fields.length === 0) {
      return NextResponse.json({ error: 'Seleziona almeno una colonna da esportare.' }, { status: 400 })
    }
    const ids =
      Array.isArray(body.ids) && body.ids.length
        ? body.ids.filter((x): x is string => typeof x === 'string')
        : null

    try {
      const tutti = await getItems(entity)
      let records: RURecord[] = tutti
      if (ids) {
        const perId = new Map(tutti.map((r) => [r.spItemId, r]))
        records = ids.map((id) => perId.get(id)).filter((r): r is RURecord => Boolean(r))
      }

      const buffer = await generaExportBuffer(entity, { fields, records })
      const filename = nomeFileExport(entity)

      await logAzione({
        utente: g.session.user.email,
        nome: g.session.user.name,
        azione: `ru.${ENTITA_SINGOLARE[entity]}.esporta`,
        entita: ENTITA_SINGOLARE[entity],
        dettagli: { colonne: fields, righe: records.length },
      })

      const body = new Uint8Array(buffer)
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(body.byteLength),
        },
      })
    } catch (e) {
      return errore(e, 'Errore esportazione')
    }
  }

  return { POST }
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
      await logAzione({
        utente: g.session.user.email,
        nome: g.session.user.name,
        azione: `ru.${ENTITA_SINGOLARE[entity]}.aggiorna`,
        entita: ENTITA_SINGOLARE[entity],
        entitaId: id,
        dettagli: { nominativo: nominativoDa(item), campi: Object.keys(body) },
      })
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
      // Recupera il nominativo PRIMA di eliminare, per registrarlo nel log.
      const daEliminare = await getItem(entity, id).catch(() => null)
      await eliminaItem(entity, id)
      await logAzione({
        utente: g.session.user.email,
        nome: g.session.user.name,
        azione: `ru.${ENTITA_SINGOLARE[entity]}.elimina`,
        entita: ENTITA_SINGOLARE[entity],
        entitaId: id,
        dettagli: { nominativo: nominativoDa(daEliminare) },
      })
      return NextResponse.json({ ok: true })
    } catch (e) {
      return errore(e, 'Errore eliminazione')
    }
  }

  return { GET, PATCH, DELETE }
}
