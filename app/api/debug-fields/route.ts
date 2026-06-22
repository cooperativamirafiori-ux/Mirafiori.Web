/**
 * DEBUG ONLY — GET /api/debug-fields
 * Elenca i nomi INTERNI reali delle colonne della lista "Richieste Manutenzione".
 * Serve per verificare le discrepanze tra nome interno SP e nome usato nel codice
 * (es. il campo "Ore" che Graph rifiuta in PATCH).
 *
 * Uso: avvia l'app (npm run dev) e apri http://localhost:3000/api/debug-fields
 */
import { graphGet } from '@/lib/graph'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const SITE = process.env.SHAREPOINT_SITE_ID!
const LIST_RICHIESTE = process.env.SP_LIST_RICHIESTE!

export async function GET() {
  // Protezione: solo admin autenticati possono vedere lo schema della lista
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  }
  try {
    const res = await graphGet<{ value: any[] }>(
      `/sites/${SITE}/lists/${LIST_RICHIESTE}/columns?$select=name,displayName,readOnly,hidden`
    )
    // Solo colonne scrivibili e non di sistema, ordinate per nome interno
    const colonne = res.value
      .map((c) => ({
        nomeInterno: c.name,
        displayName: c.displayName,
        readOnly: c.readOnly ?? false,
        hidden: c.hidden ?? false,
      }))
      .sort((a, b) => a.nomeInterno.localeCompare(b.nomeInterno))

    return NextResponse.json({
      listId: LIST_RICHIESTE,
      count: colonne.length,
      colonne,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
