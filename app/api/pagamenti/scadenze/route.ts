/**
 * GET /api/pagamenti/scadenze — le due code, i totali, l'ultimo caricamento.
 *
 * Una chiamata sola: le due code si guardano insieme, e chi approva deve
 * vedere anche quello che ha già approvato e non è ancora stato pagato.
 *
 * Permesso: 'Pagamenti' oppure 'Approvazione Pagamenti'. Chi ha solo il
 * secondo legge lo stesso tutto: i tasti glieli toglie l'interfaccia, e le
 * scritture le fermano i guard delle rispettive route.
 */

import { NextResponse } from 'next/server'
import { guardLettura } from '@/lib/pagamenti/guard'
import {
  listaScadenze,
  listaAutomatiche,
  totali,
  scadutoPerAnzianita,
  ultimoImport,
} from '@/lib/pagamenti/data'
import { getCentriDiCosto } from '@/lib/centri-costo/data'
import { sincronizzaQonto } from '@/lib/qonto/bonifici'
import { qontoOAuthConfigurato } from '@/lib/qonto/oauth'

// Chi apre la pagina vede le richieste Qonto approvate già come pagate, senza
// aspettare la notte. Al massimo una volta al minuto per istanza.
let ultimaSync = 0
async function forseSincronizza() {
  if (!qontoOAuthConfigurato() || Date.now() - ultimaSync < 60_000) return
  ultimaSync = Date.now()
  try {
    await sincronizzaQonto()
  } catch (e) {
    console.error('[scadenze] sincronizzazione Qonto', e)
  }
}

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardLettura()
  if (g.error) return g.error
  try {
    await forseSincronizza()
    const [daVerificare, daApprovare, daPagare, automatiche, tot, anzianita, ultimo, cdc] = await Promise.all([
      listaScadenze(['da_verificare']),
      listaScadenze(['da_approvare']),
      listaScadenze(['da_pagare']),
      listaAutomatiche(),
      totali(),
      scadutoPerAnzianita(),
      ultimoImport(),
      getCentriDiCosto(),
    ])
    return NextResponse.json({
      daVerificare,
      daApprovare,
      daPagare,
      automatiche,
      totali: tot,
      anzianita,
      ultimoImport: ultimo,
      // Per il servizio su ogni riga: codice minuscolo (come in fattura_passiva) e nome.
      centri: cdc.filter((c) => c.codice).map((c) => ({ codice: c.codice.toLowerCase(), nome: c.nome })),
      permessi: g.permessi,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore di lettura' },
      { status: 500 },
    )
  }
}
