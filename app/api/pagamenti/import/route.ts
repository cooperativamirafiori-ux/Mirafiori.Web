/**
 * POST /api/pagamenti/import — caricamento dell'Elenco scadenze.
 *
 * Il file arriva come corpo binario, non come formData: pesa qualche centinaio
 * di kB e non va conservato da nessuna parte, quindi non c'è niente da caricare
 * su SharePoint. Nome del file e data di decorrenza viaggiano negli header,
 * così il corpo resta il file e basta.
 *
 * Permesso: 'Pagamenti'. Chi approva non carica.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPagamento } from '@/lib/pagamenti/guard'
import { importaScadenzario } from '@/lib/pagamenti/import'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TETTO = 15 * 1024 * 1024

export async function POST(req: NextRequest) {
  const g = await guardPagamento()
  if (g.error) return g.error

  const nomeFile = decodeURIComponent(req.headers.get('x-nome-file') ?? '').trim() || 'scadenzario.xlsx'
  const decorrenza = req.headers.get('x-decorrenza')?.trim() || null
  if (decorrenza && !/^\d{4}-\d{2}-\d{2}$/.test(decorrenza)) {
    return NextResponse.json({ error: 'Data di decorrenza non valida' }, { status: 400 })
  }
  // Chiusura dal gestionale: scelta esplicita a ogni caricamento, mai un
  // default. Serve al primo import; dal secondo in poi è chi carica a doverla
  // richiedere di nuovo, guardando cosa sta facendo.
  const chiusuraDaGestionale = req.headers.get('x-chiusura-gestionale') === '1'

  let buffer: ArrayBuffer
  try {
    buffer = await req.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'File non leggibile' }, { status: 400 })
  }
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: 'Il file è vuoto' }, { status: 400 })
  }
  if (buffer.byteLength > TETTO) {
    return NextResponse.json({ error: 'File troppo grande (massimo 15 MB)' }, { status: 413 })
  }

  try {
    const ricevuta = await importaScadenzario(buffer, {
      nomeFile,
      utente: g.email,
      decorrenza,
      chiusuraDaGestionale,
    })
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.import',
      entita: 'ImportScadenzario',
      entitaId: ricevuta.id,
      dettagli: {
        nomeFile,
        righe: ricevuta.righe,
        nuove: ricevuta.nuove,
        aggiornate: ricevuta.aggiornate,
        scartate: ricevuta.scartate,
        soglia: ricevuta.soglia,
        decorrenza,
        chiusuraDaGestionale,
      },
    })
    return NextResponse.json({ ricevuta })
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : 'Import fallito'
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.import',
      entita: 'ImportScadenzario',
      esito: 'errore',
      dettagli: { nomeFile, messaggio },
    })
    return NextResponse.json({ error: messaggio }, { status: 400 })
  }
}
