/**
 * PATCH /api/it/assegnazioni/[id] — chiude o corregge un'assegnazione.
 *
 * Body JSON: { genere: 'bene' | 'sim', azione: 'restituisci' | 'correggi', … }
 *
 *   azione = "restituisci" → { dataFine? }  (default: oggi)
 *   azione = "correggi"    → { assegnatarioMail?, assegnatarioNome?,
 *                              centroDiCostoId?, nomeUtenza?, note?, dataFine? }
 *
 * Le due azioni sono separate perché non sono la stessa cosa: restituire cambia
 * lo stato del bene e svuota i campi di comodo dell'anagrafica, correggere no.
 * Lo stato non si scrive a mano — `flusso.ts` rifiuta.
 *
 * Protetta: area "IT e Dispositivi".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { ErroreFlusso, correggi, restituisci } from '@/lib/it/flusso'
import { assegnazioniConfigurate } from '@/lib/it/assegnazioni'
import { AREA_IT, type GenereAssegnazione } from '@/types/it'

export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const data = (v: unknown) => String(v ?? '').slice(0, 10)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA_IT)
  if (g.error) return g.error

  const { id } = await params
  if (!id) return err('ID assegnazione mancante')

  let body: any
  try {
    body = await req.json()
  } catch {
    return err('Body non valido (atteso JSON)')
  }

  const genere = body.genere as GenereAssegnazione
  if (genere !== 'bene' && genere !== 'sim') return err('Genere non valido: atteso "bene" o "sim".')
  if (!assegnazioniConfigurate(genere)) return err('Assegnazioni non configurate', 503)

  const azione = body.azione === 'restituisci' ? 'restituisci' : body.azione === 'correggi' ? 'correggi' : null
  if (!azione) return err('Azione non valida: attesa "restituisci" o "correggi".')

  try {
    if (azione === 'restituisci') {
      const a = await restituisci(genere, id, data(body.dataFine) || undefined)
      await logAzione({
        utente: g.session.user.email,
        nome: g.session.user.name,
        azione: 'it.restituisci',
        entita: genere === 'bene' ? 'Dispositivo' : 'Sim',
        entitaId: a.oggettoEtichetta || id,
        dettagli: { assegnatario: a.assegnatarioMail, al: a.dataFine },
      })
      return NextResponse.json({ assegnazione: a })
    }

    const mail = body.assegnatarioMail
    if (typeof mail === 'string' && mail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.trim())) {
      return err('Indirizzo email non valido.')
    }

    const a = await correggi(genere, id, {
      assegnatarioMail: mail === undefined ? undefined : String(mail || '') || null,
      assegnatarioNome:
        body.assegnatarioNome === undefined ? undefined : String(body.assegnatarioNome || '') || null,
      centroDiCostoId: body.centroDiCostoId === undefined ? undefined : Number(body.centroDiCostoId),
      // String(): un numero o un oggetto nel body non deve diventare un 500 su
      // un `.trim()` più in basso.
      nomeUtenza: body.nomeUtenza === undefined ? undefined : String(body.nomeUtenza ?? ''),
      note: body.note === undefined ? undefined : String(body.note ?? ''),
      dataAssegnazione: body.dataAssegnazione === undefined ? undefined : data(body.dataAssegnazione),
      dataFine: body.dataFine === undefined ? undefined : data(body.dataFine) || null,
    })

    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'it.correggi-assegnazione',
      entita: genere === 'bene' ? 'Dispositivo' : 'Sim',
      entitaId: a.oggettoEtichetta || id,
      dettagli: { campi: Object.keys(body).filter((k) => k !== 'genere' && k !== 'azione') },
    })

    return NextResponse.json({ assegnazione: a })
  } catch (e: any) {
    if (e instanceof ErroreFlusso) return err(e.message, 409)
    console.error(`[PATCH /api/it/assegnazioni/${id}]`, e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}
