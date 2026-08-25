/**
 * POST /api/it/dispositivi — registra un dispositivo che non nasce da una
 * richiesta d'acquisto (quelli già in casa, o entrati per altre vie).
 *
 * Body JSON: { tipoIT, marca?, modello?, descrizione?, numeroSerie?, sottoTipo?,
 *              acquisizione?, canoneMensile?, fineNoleggio?, firewallInstallato?,
 *              dataAcquisto?, fornitore?, valore?, mesiGaranzia?,
 *              scadenzaGaranzia?, garanzieAccessorie?, fatturaRif? }
 *
 * Il bene nasce "In magazzino" e prende il suo numero di inventario: entra nel
 * registro unico, non in un elenco separato dei dispositivi. Poi si assegna.
 *
 * Protetta: area "IT e Dispositivi".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { inventarioConfigurato } from '@/lib/inventario/data'
import { creaDispositivo } from '@/lib/it/dispositivi'
import { ErroreFlusso } from '@/lib/it/flusso'
import { AREA_IT, MODI_ACQUISIZIONE, TIPI_IT, type ModoAcquisizione, type TipoIT } from '@/types/it'

export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const testo = (v: unknown) => String(v ?? '').trim()
const numero = (v: unknown) => (v === '' || v == null ? undefined : Number(v))
const data = (v: unknown) => (testo(v) ? testo(v).slice(0, 10) : undefined)

export async function POST(req: NextRequest) {
  const g = await guardArea(AREA_IT)
  if (g.error) return g.error
  if (!inventarioConfigurato()) return err('Inventario non configurato', 503)

  let body: any
  try {
    body = await req.json()
  } catch {
    return err('Body non valido (atteso JSON)')
  }

  const tipoIT = body.tipoIT as TipoIT
  if (!TIPI_IT.includes(tipoIT)) return err('Indica che tipo di dispositivo è.')

  const acquisizione = body.acquisizione as ModoAcquisizione | undefined
  if (acquisizione && !MODI_ACQUISIZIONE.includes(acquisizione)) {
    return err('Modo di acquisizione non valido.')
  }
  if (!testo(body.marca) && !testo(body.modello) && !testo(body.descrizione)) {
    return err('Serve almeno la marca, il modello o una descrizione.')
  }

  try {
    const bene = await creaDispositivo({
      tipoIT,
      sottoTipo: testo(body.sottoTipo),
      marca: testo(body.marca),
      modello: testo(body.modello),
      descrizione: testo(body.descrizione),
      numeroSerie: testo(body.numeroSerie),
      acquisizione,
      canoneMensile: numero(body.canoneMensile),
      fineNoleggio: data(body.fineNoleggio),
      firewallInstallato:
        typeof body.firewallInstallato === 'boolean' ? body.firewallInstallato : undefined,
      dataAcquisto: data(body.dataAcquisto),
      fornitore: testo(body.fornitore),
      valore: numero(body.valore),
      mesiGaranzia: numero(body.mesiGaranzia),
      scadenzaGaranzia: data(body.scadenzaGaranzia),
      garanzieAccessorie: testo(body.garanzieAccessorie),
      fatturaRif: testo(body.fatturaRif),
    })

    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'it.crea-dispositivo',
      entita: 'Dispositivo',
      entitaId: bene.numero,
      dettagli: { tipoIT, marca: bene.marca, modello: bene.modello, seriale: bene.numeroSerie },
    })

    return NextResponse.json({ bene })
  } catch (e: any) {
    if (e instanceof ErroreFlusso) return err(e.message, 409)
    console.error('[POST /api/it/dispositivi]', e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}
