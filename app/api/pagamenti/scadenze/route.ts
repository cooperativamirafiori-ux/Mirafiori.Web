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

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await guardLettura()
  if (g.error) return g.error
  try {
    const [daApprovare, daPagare, automatiche, tot, anzianita, ultimo] = await Promise.all([
      listaScadenze(['da_approvare']),
      listaScadenze(['da_pagare']),
      listaAutomatiche(),
      totali(),
      scadutoPerAnzianita(),
      ultimoImport(),
    ])
    return NextResponse.json({
      daApprovare,
      daPagare,
      automatiche,
      totali: tot,
      anzianita,
      ultimoImport: ultimo,
      permessi: g.permessi,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore di lettura' },
      { status: 500 },
    )
  }
}
