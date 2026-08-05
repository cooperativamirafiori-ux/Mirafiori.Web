/**
 * POST /api/risorse-umane/dipendenti/[id]/documenti
 *   body: { filename, categoria?, dimensione? }
 *   → { uploadUrl, scadeIl, nomeFile }
 *
 * NON riceve il file: apre una sessione di caricamento su SharePoint e
 * restituisce l'URL a cui il browser invia i byte **direttamente**. Prima questa
 * route accettava un multipart e rigirava il contenuto a Graph, il che
 * significava far transitare una carta d'identità dalla memoria di una funzione
 * serverless e restare entro i 4 MB. Vedi `creaSessioneUploadDocumento`.
 *
 * A caricamento finito il browser chiama `documenti/conferma`, che registra
 * l'azione nel log: così il log non riporta caricamenti interrotti a metà.
 *
 * Accesso: membri del gruppo Microsoft 365 "Risorse Umane" (vedi lib/gruppo-ru.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardMembroRU } from '@/lib/core/api-guard'
import { creaSessioneUploadDocumento } from '@/lib/risorse-umane/data'
import { graphRU, isRiautenticazione, isAccessoNegato } from '@/lib/core/graph-delegato'

export const dynamic = 'force-dynamic'

/**
 * Tetto di prudenza, non un limite tecnico: con le sessioni di upload Graph
 * arriva a dimensioni molto maggiori. Serve a evitare che un file scelto per
 * sbaglio riempia la cartella di un dipendente.
 */
const MAX_BYTES = 50 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMembroRU()
  if (g.error) return g.error
  const { id } = await params

  let body: { filename?: unknown; categoria?: unknown; dimensione?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const filename = typeof body.filename === 'string' ? body.filename.trim() : ''
  if (!filename) {
    return NextResponse.json({ error: 'Nome del file mancante' }, { status: 400 })
  }

  const dimensione = Number(body.dimensione)
  if (Number.isFinite(dimensione) && dimensione > MAX_BYTES) {
    return NextResponse.json(
      { error: `File troppo grande (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` },
      { status: 400 },
    )
  }

  // Categoria (facoltativa): prefissa il nome del file, es. "Contratto - <nome>.pdf"
  const categoria = typeof body.categoria === 'string' ? body.categoria.trim() : ''
  const nomeCompleto = categoria ? `${categoria} - ${filename}` : filename

  try {
    const gc = await graphRU(g.session.user.email)
    const sessione = await creaSessioneUploadDocumento(gc, id, nomeCompleto)
    // Nessun log qui: l'azione si registra alla conferma, quando il file esiste
    // davvero. Registrarla adesso lascerebbe nel log caricamenti mai completati.
    return NextResponse.json(sessione)
  } catch (e) {
    if (isRiautenticazione(e)) {
      return NextResponse.json({ error: e.message, codice: 'riautenticazione' }, { status: 401 })
    }
    if (isAccessoNegato(e)) {
      return NextResponse.json({ error: e.message, codice: 'permessi-sito' }, { status: 403 })
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore apertura sessione di caricamento' },
      { status: 500 },
    )
  }
}
