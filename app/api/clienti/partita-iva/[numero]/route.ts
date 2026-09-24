/**
 * GET /api/clienti/partita-iva/[numero] — nome e sede di un'azienda italiana
 * dalla partita IVA (servizio europeo VIES), per compilare il modulo da soli.
 *
 * Risponde sempre 200 con `{ trovato: false }` quando non trova niente o VIES
 * non risponde: per il modulo non è un errore, è il caso in cui si scrive a mano.
 *
 * Accesso: qualsiasi utente autenticato, come la sezione Richiesta Fattura.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { cercaPartitaIva } from '@/lib/clienti/vies'
import { partitaIvaValida } from '@/types/fatture'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ numero: string }> },
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const { numero } = await params
  if (!partitaIvaValida(numero)) {
    return NextResponse.json({ error: 'Partita IVA non valida' }, { status: 400 })
  }

  const dati = await cercaPartitaIva(numero)
  return NextResponse.json(dati ? { trovato: true, ...dati } : { trovato: false })
}
