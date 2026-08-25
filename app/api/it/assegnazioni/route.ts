/**
 * POST /api/it/assegnazioni — assegna un dispositivo o una SIM a qualcuno.
 *
 * Body JSON:
 *   { genere: 'bene' | 'sim', oggettoId, centroDiCostoId, dataAssegnazione,
 *     assegnatarioMail?, assegnatarioNome?, nomeUtenza?, note? }
 *
 * L'assegnatario può mancare: NAS, stampanti e fax stanno in un servizio, non in
 * mano a una persona. Il centro di costo no.
 *
 * Chiudere l'assegnazione precedente, aggiornare lo stato del bene e ricopiare
 * chi ce l'ha sull'anagrafica lo fa `lib/it/flusso.ts`: qui si controlla solo
 * che i dati siano scritti bene.
 *
 * Protetta: area "IT e Dispositivi".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { ErroreFlusso, assegna } from '@/lib/it/flusso'
import { assegnazioniConfigurate } from '@/lib/it/assegnazioni'
import { AREA_IT, type GenereAssegnazione } from '@/types/it'

export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

export async function POST(req: NextRequest) {
  const g = await guardArea(AREA_IT)
  if (g.error) return g.error

  let body: any
  try {
    body = await req.json()
  } catch {
    return err('Body non valido (atteso JSON)')
  }

  const genere = body.genere as GenereAssegnazione
  if (genere !== 'bene' && genere !== 'sim') return err('Genere non valido: atteso "bene" o "sim".')
  if (!assegnazioniConfigurate(genere)) return err('Assegnazioni non configurate', 503)

  const oggettoId = Number(body.oggettoId)
  if (!oggettoId) return err('Manca l’oggetto da assegnare.')
  const centroDiCostoId = Number(body.centroDiCostoId)
  if (!centroDiCostoId) return err('Il centro di costo è obbligatorio.')

  const mail = String(body.assegnatarioMail ?? '').trim()
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return err('Indirizzo email non valido.')

  try {
    const a = await assegna(genere, {
      oggettoId,
      centroDiCostoId,
      assegnatarioMail: mail || undefined,
      assegnatarioNome: String(body.assegnatarioNome ?? '').trim() || undefined,
      nomeUtenza: String(body.nomeUtenza ?? '').trim() || undefined,
      dataAssegnazione: String(body.dataAssegnazione ?? '').slice(0, 10),
      note: String(body.note ?? '').trim() || undefined,
    })

    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'it.assegna',
      entita: genere === 'bene' ? 'Dispositivo' : 'Sim',
      entitaId: a.oggettoEtichetta || String(oggettoId),
      dettagli: {
        assegnatario: a.assegnatarioMail ?? '(in condivisione)',
        centroDiCosto: a.centroDiCosto?.value,
        dal: a.dataAssegnazione,
      },
    })

    return NextResponse.json({ assegnazione: a })
  } catch (e: any) {
    if (e instanceof ErroreFlusso) return err(e.message, 409)
    console.error('[POST /api/it/assegnazioni]', e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}
