/**
 * POST /api/it/sim — registra una SIM in anagrafica.
 *
 * Body JSON: { iccid, numero, operatore?, tipoPiano?, nomePiano?, fornitore?,
 *              dataAttivazione?, riferimentoContratto?, costoMensile?, note? }
 *
 * L'ICCID è la chiave: è il seriale stampato sulla scheda, e non cambia quando
 * il numero viene portato altrove. Si rifiuta un ICCID già presente, altrimenti
 * la stessa scheda finisce due volte in elenco.
 *
 * Protetta: area "IT e Dispositivi".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { creaSim, getSim, simConfigurate } from '@/lib/it/sim'
import { AREA_IT, TIPI_PIANO, numeroNormalizzato, type TipoPiano } from '@/types/it'

export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const testo = (v: unknown) => String(v ?? '').trim()

export async function POST(req: NextRequest) {
  const g = await guardArea(AREA_IT)
  if (g.error) return g.error
  if (!simConfigurate()) return err('Lista SIM non configurata', 503)

  let body: any
  try {
    body = await req.json()
  } catch {
    return err('Body non valido (atteso JSON)')
  }

  const iccid = testo(body.iccid)
  const numero = testo(body.numero)
  if (!iccid) return err('L’ICCID è obbligatorio: è il seriale stampato sulla scheda.')
  if (!numero) return err('Il numero è obbligatorio.')

  const tipoPiano = body.tipoPiano as TipoPiano | undefined
  if (tipoPiano && !TIPI_PIANO.includes(tipoPiano)) return err('Tipo di piano non valido.')

  try {
    const esistenti = await getSim()
    if (esistenti.some((s) => s.iccid === iccid)) {
      return err(`L’ICCID ${iccid} è già in anagrafica.`, 409)
    }
    const gemella = esistenti.find(
      (s) => numeroNormalizzato(s.numero) === numeroNormalizzato(numero) && s.stato !== 'Cessata',
    )
    if (gemella) {
      return err(
        `Il numero ${numero} è già su una SIM attiva (ICCID ${gemella.iccid}). ` +
          'Se è una sostituzione, cessa prima quella vecchia.',
        409,
      )
    }

    const sim = await creaSim({
      iccid,
      numero,
      operatore: testo(body.operatore),
      tipoPiano,
      nomePiano: testo(body.nomePiano),
      fornitore: testo(body.fornitore),
      dataAttivazione: testo(body.dataAttivazione).slice(0, 10) || undefined,
      riferimentoContratto: testo(body.riferimentoContratto),
      costoMensile: body.costoMensile === '' || body.costoMensile == null ? undefined : Number(body.costoMensile),
      note: testo(body.note),
    })

    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'it.crea-sim',
      entita: 'Sim',
      entitaId: sim.numero,
      dettagli: { iccid: sim.iccid, operatore: sim.operatore },
    })

    return NextResponse.json({ sim })
  } catch (e: any) {
    console.error('[POST /api/it/sim]', e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}
