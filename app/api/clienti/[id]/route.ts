/**
 * GET /api/clienti/[id] — scheda completa di un cliente.
 *
 * Il modulo riceve al caricamento della pagina solo un indice leggero
 * (denominazione, codici, comune) per cercare senza chiamare il server a ogni
 * tasto premuto; la scheda intera si chiede qui, una volta, quando l'utente ha
 * scelto un cliente. Di norma è servita dalla cache di `lib/clienti/data`,
 * quindi non costa una lettura a SharePoint.
 *
 * Accesso: qualsiasi utente autenticato, come la sezione Richiesta Fattura.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { getCliente } from '@/lib/clienti/data'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const { id } = await params
  const cliente = await getCliente(id)
  if (!cliente) return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 })

  return NextResponse.json({ cliente })
}
