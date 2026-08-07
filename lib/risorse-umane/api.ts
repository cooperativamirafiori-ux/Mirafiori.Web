/**
 * Factory di handler per le API route dell'area Risorse Umane.
 * Ogni entità (dipendenti — che include anche i collaboratori, distinti dal
 * campo CategoriaRU — /tirocini) ha le stesse operazioni CRUD, quindi i route
 * file si limitano a:
 *
 *   export const { GET, POST } = listHandlers('dipendenti')
 *
 * Tutte le route sono protette dal permesso "Risorse Umane".
 *
 * Identità: dopo `guardArea` si costruisce UNA VOLTA il client Graph con
 * `graphRU(session.user.email)` e lo si passa alle funzioni di lib/risorse-umane.
 * Sull'assetto nuovo scrive con l'identità dell'utente, così il log nativo
 * Microsoft riporta la persona reale.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardMembroRU } from '@/lib/core/api-guard'
import {
  getItems,
  getItem,
  creaItem,
  aggiornaItem,
  eliminaItem,
  validaInput,
} from '@/lib/risorse-umane/data'
import { graphRU, isRiautenticazione, isAccessoNegato } from '@/lib/core/graph-delegato'
import { sincronizzaRecordRU } from '@/lib/timbrature/sync'
import { logAzione } from '@/lib/core/audit'
import { generaExportBuffer, nomeFileExport } from '@/lib/risorse-umane/export-xlsx'
import { generaSchedaSocioBuffer, nomeFileSchedaSocio } from '@/lib/risorse-umane/export-scheda-socio'
import { RU_CONFIG, type RUEntity, type RURecord } from '@/types/risorse-umane'

/**
 * Etichetta dell'area, usata nei codici azione del log applicativo.
 *
 * ⚠️ NON è più un permesso della lista Autorizzazioni: l'accesso alle anagrafiche
 * dipende dall'appartenenza al gruppo M365 (vedi `guardMembroRU`).
 */
export const AREA_RU = 'Risorse Umane'

/** Entità RU al singolare, per i codici azione del log (es. "ru.dipendente.crea"). */
const ENTITA_SINGOLARE: Record<RUEntity, string> = {
  dipendenti: 'dipendente',
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

/**
 * Traduce gli errori del canale delegato in risposte comprensibili.
 * Senza questa traduzione ogni problema di permessi diventa una richiesta di
 * assistenza, perché Graph restituisce sempre lo stesso 403 opaco.
 */
function errore(e: unknown, fallback: string, status = 500) {
  if (isRiautenticazione(e)) {
    return NextResponse.json(
      { error: e.message, codice: 'riautenticazione' },
      { status: 401 },
    )
  }
  if (isAccessoNegato(e)) {
    return NextResponse.json(
      { error: e.message, codice: 'permessi-sito' },
      { status: 403 },
    )
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : fallback },
    { status },
  )
}

export function listHandlers(entity: RUEntity) {
  async function GET() {
    const g = await guardMembroRU()
    if (g.error) return g.error
    try {
      const gc = await graphRU(g.session.user.email)
      const items = await getItems(gc, entity)
      return NextResponse.json({ items })
    } catch (e) {
      return errore(e, 'Errore lettura dati')
    }
  }

  async function POST(req: NextRequest) {
    const g = await guardMembroRU()
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
      const gc = await graphRU(g.session.user.email)
      const item = await creaItem(gc, entity, body)
      const sync = await sincronizzaRecordRU(item)
      await logAzione({
        utente: g.session.user.email,
        nome: g.session.user.name,
        azione: `ru.${ENTITA_SINGOLARE[entity]}.crea`,
        entita: ENTITA_SINGOLARE[entity],
        entitaId: item.spItemId,
        dettagli: { nominativo: nominativoDa(item) || nominativoDa(body), timbrature: sync.azione },
      })
      return NextResponse.json({ item, avviso: sync.avviso })
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
    const g = await guardMembroRU()
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
      const gc = await graphRU(g.session.user.email)
      const tutti = await getItems(gc, entity)
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

/**
 * Handler "Scheda socio": genera per UN record l'export .xlsx precompilato
 * a partire dal modello del libro soci (vedi lib/risorse-umane/export-scheda-socio.ts).
 *
 *   export const { GET } = schedaSocioHandler('dipendenti')
 */
export function schedaSocioHandler(entity: RUEntity) {
  async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const g = await guardMembroRU()
    if (g.error) return g.error
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })
    try {
      const gc = await graphRU(g.session.user.email)
      const item = await getItem(gc, entity, id)
      const buffer = await generaSchedaSocioBuffer(item)
      const filename = nomeFileSchedaSocio(item)

      await logAzione({
        utente: g.session.user.email,
        nome: g.session.user.name,
        azione: `ru.${ENTITA_SINGOLARE[entity]}.scheda-socio`,
        entita: ENTITA_SINGOLARE[entity],
        entitaId: id,
        dettagli: { nominativo: nominativoDa(item) },
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
      return errore(e, 'Errore generazione scheda socio')
    }
  }

  return { GET }
}

export function itemHandlers(entity: RUEntity) {
  async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const g = await guardMembroRU()
    if (g.error) return g.error
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })
    try {
      const gc = await graphRU(g.session.user.email)
      const item = await getItem(gc, entity, id)
      return NextResponse.json({ item })
    } catch (e) {
      return errore(e, 'Errore lettura')
    }
  }

  async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const g = await guardMembroRU()
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
      const gc = await graphRU(g.session.user.email)
      const item = await aggiornaItem(gc, entity, id, body)
      const sync = await sincronizzaRecordRU(item)
      await logAzione({
        utente: g.session.user.email,
        nome: g.session.user.name,
        azione: `ru.${ENTITA_SINGOLARE[entity]}.aggiorna`,
        entita: ENTITA_SINGOLARE[entity],
        entitaId: id,
        dettagli: { nominativo: nominativoDa(item), campi: Object.keys(body), timbrature: sync.azione },
      })
      return NextResponse.json({ item, avviso: sync.avviso })
    } catch (e) {
      return errore(e, 'Errore aggiornamento')
    }
  }

  async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const g = await guardMembroRU()
    if (g.error) return g.error
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })
    try {
      const gc = await graphRU(g.session.user.email)
      // Recupera il nominativo PRIMA di eliminare, per registrarlo nel log.
      const daEliminare = await getItem(gc, entity, id).catch(() => null)
      await eliminaItem(gc, entity, id)
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
