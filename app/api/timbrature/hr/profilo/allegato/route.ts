/**
 * POST /api/timbrature/hr/profilo/allegato — apre la sessione di caricamento
 * PUT  /api/timbrature/hr/profilo/allegato — conferma e restituisce il documento
 *
 * La lettera di variazione dell'orario, caricata nella cartella personale del
 * dipendente su SharePoint. Solo HR.
 *
 * Due passaggi perche' i byte del file NON passano dal nostro server: apriamo la
 * sessione su Graph, il browser carica a blocchi direttamente su SharePoint
 * (vedi `lib/core/upload-diretto.ts`), poi si conferma per sapere dov'e' finito.
 * E' la stessa strada di tutti gli altri allegati dell'app.
 *
 * Il ponte fra i due mondi: in Timbrature la persona e' identificata dalla mail,
 * la cartella personale sta su una scheda RU. `trovaSchedaPerEmail` fa la
 * traduzione — la stessa che usa l'archiviazione del foglio ore.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardHr } from '@/lib/timbrature/guard'
import { getDipendenteById } from '@/lib/timbrature/data'
import { graphRU } from '@/lib/core/graph-delegato'
import {
  creaSessioneUploadDocumento,
  getDocumentiDipendente,
  trovaSchedaPerEmail,
} from '@/lib/risorse-umane/data'
import { MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/core/upload-diretto'

export const dynamic = 'force-dynamic'

/**
 * Risolve la scheda RU del dipendente delle timbrature.
 *
 * Se la scheda non c'e' non si inventa niente e non si ripiega altrove: e' lo
 * stesso principio dell'archiviazione del foglio ore. Una lettera di variazione
 * caricata in un posto che nessuno guarda e' peggio di una lettera non caricata.
 */
async function risolviScheda(email: string, dipendenteId: number) {
  const dip = await getDipendenteById(dipendenteId)
  if (!dip) return { errore: 'Dipendente non trovato', stato: 404 as const }
  const gc = await graphRU(email)
  const scheda = await trovaSchedaPerEmail(gc, dip.email)
  if (!scheda) {
    return {
      errore:
        `${dip.cognomeNome} non risulta nell'anagrafica Risorse Umane con la mail ${dip.email}: ` +
        `senza scheda non esiste la cartella personale in cui mettere la lettera.`,
      stato: 409 as const,
    }
  }
  return { gc, spItemId: String(scheda.spItemId) }
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
  const dipendenteId = Number(body?.dipendenteId)
  const filename = String(body?.filename ?? '').trim()
  const dimensione = Number(body?.dimensione ?? 0)
  if (!dipendenteId || !filename) {
    return NextResponse.json({ error: 'dipendenteId e filename obbligatori' }, { status: 400 })
  }
  if (dimensione > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File troppo grande (max ${maxUploadMb()} MB)` }, { status: 400 })
  }

  try {
    const r = await risolviScheda(g.session.user.email!, dipendenteId)
    if ('errore' in r) return NextResponse.json({ error: r.errore }, { status: r.stato })
    const sessione = await creaSessioneUploadDocumento(r.gc, r.spItemId, filename)
    return NextResponse.json(sessione)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore apertura caricamento' },
      { status: 500 },
    )
  }
}

export async function PUT(req: NextRequest) {
  const g = await guardHr()
  if (g.error) return g.error
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const dipendenteId = Number(body?.dipendenteId)
  const nomeFile = String(body?.nomeFile ?? '').trim()
  if (!dipendenteId || !nomeFile) {
    return NextResponse.json({ error: 'dipendenteId e nomeFile obbligatori' }, { status: 400 })
  }

  try {
    const r = await risolviScheda(g.session.user.email!, dipendenteId)
    if ('errore' in r) return NextResponse.json({ error: r.errore }, { status: r.stato })
    // Il nome puo' essere cambiato in fase di upload (conflictBehavior: rename),
    // quindi si cerca la corrispondenza esatta e poi si ripiega sul prefisso.
    const documenti = await getDocumentiDipendente(r.gc, r.spItemId)
    const doc =
      documenti.find((d) => d.nome === nomeFile) ??
      documenti.find((d) => d.nome.startsWith(nomeFile.replace(/\.[^.]+$/, '')))
    if (!doc) {
      return NextResponse.json(
        { error: 'Il file non risulta nella cartella personale: riprova il caricamento.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ file: { url: doc.url, nome: doc.nome } })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore conferma caricamento' },
      { status: 500 },
    )
  }
}
