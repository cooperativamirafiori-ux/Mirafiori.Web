/**
 * Endpoint PUBBLICO (token monouso) per il caricamento della notula firmata
 * da parte del prestatore — NON richiede login.
 *
 *   GET  /api/notula/[token]           → valida il token e ritorna dati minimi
 *   POST /api/notula/[token]/sessione  → apre la sessione di upload su SharePoint
 *   POST /api/notula/[token]/conferma  → registra il file caricato, stato e notifiche
 *
 * Il file NON passa più da qui: il browser del prestatore lo carica direttamente
 * su SharePoint con l'URL pre-autorizzato della sessione, quindi non vale più il
 * limite dei 4 MB dell'upload semplice di Graph.
 *
 * La sicurezza è data dal token: imprevedibile, legato alla singola pratica.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPrestazioneByToken } from '@/lib/prestazioni'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const p = await getPrestazioneByToken(token).catch(() => null)
  if (!p) return NextResponse.json({ error: 'Link non valido o scaduto' }, { status: 404 })
  return NextResponse.json({
    idPrestazione: p.idPrestazione,
    prestatoreNome: `${p.cognome} ${p.nome}`.trim(),
    giaCaricata: !!p.notulaUrl,
  })
}
