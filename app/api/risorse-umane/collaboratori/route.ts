import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * La lista "Collaboratori" è stata unificata nella lista Dipendenti (2026-07,
 * campo CategoriaRU). Questa route non serve più: usa
 * /api/risorse-umane/dipendenti (filtrando per CategoriaRU=Collaboratore).
 */
function gone() {
  return NextResponse.json(
    { error: 'Endpoint dismesso: i collaboratori sono ora nella lista Dipendenti (CategoriaRU=Collaboratore). Usa /api/risorse-umane/dipendenti.' },
    { status: 410 },
  )
}

export const GET = gone
export const POST = gone
