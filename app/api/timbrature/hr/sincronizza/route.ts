/**
 * POST /api/timbrature/hr/sincronizza
 *
 * Riallinea l'anagrafica delle timbrature all'anagrafica Risorse Umane: attiva
 * chi ha la spunta "Timbratura attiva", disattiva chi non l'ha (o non l'ha più)
 * e aggiorna i nominativi. Serve per il primo popolamento e ogni volta che si
 * vuole essere certi che il cruscotto rispecchi l'anagrafica.
 *
 * Idempotente: si può premere quante volte si vuole. Solo HR.
 */

import { NextResponse } from 'next/server'
import { guardHr } from '@/lib/timbrature-guard'
import { sincronizzaTuttoRU } from '@/lib/timbrature-sync'
import { graphRU, isRiautenticazione, isAccessoNegato } from '@/lib/graph-delegato'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const g = await guardHr()
  if (g.error) return g.error
  try {
    // Le anagrafiche RU si leggono con l'identità dell'utente: il log nativo
    // Microsoft deve riportare chi ha fatto la lettura, non l'applicazione.
    const gc = await graphRU(g.session.user.email)
    const esito = await sincronizzaTuttoRU(gc)
    return NextResponse.json({ esito })
  } catch (e) {
    if (isRiautenticazione(e)) {
      return NextResponse.json({ error: e.message, codice: 'riautenticazione' }, { status: 401 })
    }
    if (isAccessoNegato(e)) {
      return NextResponse.json({ error: e.message, codice: 'permessi-sito' }, { status: 403 })
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore sincronizzazione' },
      { status: 500 },
    )
  }
}
