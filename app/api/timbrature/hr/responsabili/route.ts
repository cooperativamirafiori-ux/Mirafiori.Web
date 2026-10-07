/**
 * /api/timbrature/hr/responsabili — schermata "Responsabili e abilitazioni".
 *
 *   GET    → { persone: PersonaAbilitazione[] }
 *   PATCH  { modifiche: ModificaAbilitazione[] } → { esiti: EsitoModificaAbilitazione[] }
 *
 * Solo HR (permesso "Timbrature HR"). Le schede RU si leggono e si scrivono con
 * l'identità dell'utente, quindi serve anche essere membri del sito Risorse
 * Umane: se manca, la risposta è 403 `permessi-sito` con il messaggio che dice
 * cosa fare. Vedi lib/timbrature/responsabili.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardHr } from '@/lib/timbrature/guard'
import { elencoAbilitazioni, applicaModifica, MAX_MODIFICHE } from '@/lib/timbrature/responsabili'
import { graphRU, isRiautenticazione, isAccessoNegato } from '@/lib/core/graph-delegato'
import { logAzione } from '@/lib/core/audit'
import type { EsitoModificaAbilitazione, ModificaAbilitazione } from '@/types/timbrature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function errore(e: unknown, fallback: string) {
  if (isRiautenticazione(e)) {
    return NextResponse.json({ error: e.message, codice: 'riautenticazione' }, { status: 401 })
  }
  if (isAccessoNegato(e)) {
    return NextResponse.json({ error: e.message, codice: 'permessi-sito' }, { status: 403 })
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : fallback }, { status: 500 })
}

export async function GET() {
  const g = await guardHr()
  if (g.error) return g.error
  try {
    const gc = await graphRU(g.session.user.email)
    const persone = await elencoAbilitazioni(gc)
    return NextResponse.json({ persone })
  } catch (e) {
    return errore(e, 'Errore lettura anagrafica')
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guardHr()
  if (g.error) return g.error

  let modifiche: ModificaAbilitazione[]
  try {
    const body = await req.json()
    modifiche = Array.isArray(body?.modifiche) ? body.modifiche : []
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  if (modifiche.length === 0) {
    return NextResponse.json({ error: 'Nessuna modifica.' }, { status: 400 })
  }
  if (modifiche.length > MAX_MODIFICHE) {
    return NextResponse.json(
      { error: `Al massimo ${MAX_MODIFICHE} persone per volta: dividi la selezione.` },
      { status: 400 },
    )
  }

  try {
    const gc = await graphRU(g.session.user.email)
    const esiti: EsitoModificaAbilitazione[] = []
    // Una alla volta: SharePoint limita le scritture ravvicinate, e l'ordine
    // degli esiti deve corrispondere a quello delle modifiche.
    for (const m of modifiche) {
      const esito = await applicaModifica(gc, m)
      esiti.push(esito)
      if (esito.ok && esito.persona) {
        await logAzione({
          utente: g.session.user.email,
          nome: g.session.user.name,
          azione: 'timbrature.abilitazione.aggiorna',
          entita: m.entity === 'tirocini' ? 'tirocinio' : 'dipendente',
          entitaId: m.spItemId,
          dettagli: {
            nominativo: esito.persona.nominativo,
            timbraturaAttiva: m.timbraturaAttiva,
            nonTimbra: m.nonTimbra,
            referente: m.referente,
          },
        })
      }
    }
    return NextResponse.json({ esiti })
  } catch (e) {
    return errore(e, 'Errore salvataggio')
  }
}
