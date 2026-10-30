/**
 * POST /api/assistente — una domanda all'assistente "?".
 * Corpo: { domanda, pagina, storia: [{ ruolo: 'utente'|'assistente', testo }] }
 * Risposta: { risposta, id } — `id` serve per il "ti è stata utile?".
 *
 * Aperta a tutti quelli che entrano nell'app. Logica in lib/assistente/.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { leggiGuida } from '@/lib/assistente/guida'
import { vociAccesso } from '@/lib/assistente/profilo'
import { chiediAssistente, assistenteConfigurato, MAX_DOMANDA, type Messaggio } from '@/lib/assistente/chiedi'
import { contaDomanda, registraDomanda, LIMITE_GIORNO } from '@/lib/assistente/registro'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  if (!assistenteConfigurato()) {
    return NextResponse.json({ error: "L'assistente non è ancora attivo." }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  const domanda = typeof body?.domanda === 'string' ? body.domanda.trim() : ''
  if (!domanda) return NextResponse.json({ error: 'Scrivi una domanda.' }, { status: 400 })
  if (domanda.length > MAX_DOMANDA) {
    return NextResponse.json({ error: `La domanda è troppo lunga (massimo ${MAX_DOMANDA} caratteri).` }, { status: 400 })
  }
  const pagina = typeof body?.pagina === 'string' && body.pagina.startsWith('/') ? body.pagina.slice(0, 200) : null
  const storia: Messaggio[] = Array.isArray(body?.storia)
    ? body.storia
        .filter((m: any) => (m?.ruolo === 'utente' || m?.ruolo === 'assistente') && typeof m?.testo === 'string')
        .map((m: any) => ({ ruolo: m.ruolo, testo: m.testo }))
    : []

  const { superato } = await contaDomanda(email)
  if (superato) {
    return NextResponse.json(
      { error: `Per oggi hai fatto molte domande (il massimo è ${LIMITE_GIORNO}). Riprova domani, oppure chiedi all'ufficio amministrazione.` },
      { status: 429 },
    )
  }

  try {
    leggiGuida()
  } catch (e) {
    console.error('[assistente] guida non leggibile:', e)
    return NextResponse.json({ error: "L'assistente non trova la guida. Avvisa l'ufficio amministrazione." }, { status: 500 })
  }

  try {
    const voci = await vociAccesso(session.user)
    const r = await chiediAssistente({ domanda, storia, pagina, nome: session.user?.name ?? '', voci })
    const id = await registraDomanda({
      pagina,
      domanda,
      risposta: r.testo,
      modello: r.modello,
      tokenIn: r.tokenIn,
      tokenOut: r.tokenOut,
    })
    return NextResponse.json({ risposta: r.testo, id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 502 })
  }
}
