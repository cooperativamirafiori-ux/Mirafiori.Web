/**
 * POST /api/pagamenti/uscite — inserisce un'uscita senza fattura
 *
 * Permesso: 'Pagamenti'. È lo stesso di chi carica lo scadenzario e chiude una
 * scadenza, e per la stessa ragione: chi tiene la cassa è chi sa cosa esce.
 *
 * La riga nasce in coda DA PAGARE. Non passa dall'approvazione sopra soglia
 * nemmeno quando è grossa: vedi la regola 1 in lib/pagamenti/uscite.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardPagamento } from '@/lib/pagamenti/guard'
import { creaUscita, uscitaSimile, validaUscita } from '@/lib/pagamenti/uscite'
import { logAzione } from '@/lib/core/audit'
import type { NuovaUscita } from '@/types/pagamenti'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await guardPagamento()
  if (g.error) return g.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const esito = validaUscita((body ?? {}) as Partial<NuovaUscita>)
  if (!esito.ok) {
    return NextResponse.json({ error: esito.errore, campo: esito.campo }, { status: 400 })
  }
  const v = esito.valore

  // Il doppione si segnala, non si blocca: chi inserisce può avere ragione
  // (due rate uguali nello stesso mese esistono). Serve un secondo passaggio
  // consapevole, con `confermaDoppione`.
  const conferma = (body as { confermaDoppione?: boolean })?.confermaDoppione === true
  if (!conferma) {
    const simile = await uscitaSimile(v)
    if (simile) {
      return NextResponse.json(
        {
          error: 'Forse è già inserita',
          simile,
          richiedeConferma: true,
        },
        { status: 409 },
      )
    }
  }

  try {
    const { id } = await creaUscita(v, g.email)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.uscita.crea',
      entita: 'Scadenza',
      entitaId: id,
      dettagli: { ...v, confermaDoppione: conferma },
    })
    return NextResponse.json({ id })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Inserimento fallito' },
      { status: 400 },
    )
  }
}
