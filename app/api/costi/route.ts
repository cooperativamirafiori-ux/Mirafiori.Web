/**
 * POST /api/costi — Inserisce un costo direttamente su una struttura
 *
 * Non passa da una richiesta di manutenzione: crea un record in
 * "Costi Strutture" con Fonte="Diretto". Solo admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { creaCostoDiretto } from '@/lib/sharepoint'
import { logAzione } from '@/lib/audit'
import type { NuovoCostoPayload } from '@/types/manutenzioni'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  }

  let body: NuovoCostoPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { strutturaId, categoria, importo, dataCosto, fornitore, causale } = body

  if (!strutturaId || !categoria?.trim() || !dataCosto) {
    return NextResponse.json(
      { error: 'Campi obbligatori mancanti: struttura, categoria, data' },
      { status: 400 }
    )
  }
  const importoNum = Number(importo)
  if (!Number.isFinite(importoNum) || importoNum <= 0) {
    return NextResponse.json(
      { error: 'Importo non valido (deve essere maggiore di zero)' },
      { status: 400 }
    )
  }

  try {
    await creaCostoDiretto({
      StrutturaLookupId: Number(strutturaId),
      Categoria: categoria.trim(),
      Importo: importoNum,
      DataCosto: dataCosto,
      Fornitore: fornitore,
      Causale: causale,
    })
    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: 'costo.crea',
      entita: 'CostoStruttura',
      entitaId: strutturaId,
      dettagli: { categoria, importo: importoNum, fornitore: fornitore || undefined },
    })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/costi]', err)
    return NextResponse.json(
      { error: err.message ?? 'Errore interno' },
      { status: 500 }
    )
  }
}
