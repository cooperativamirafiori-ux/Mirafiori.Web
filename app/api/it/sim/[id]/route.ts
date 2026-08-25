/**
 * PATCH /api/it/sim/[id] — aggiorna l'anagrafica di una SIM.
 *
 * Accetta i campi di `ModificaSim`. Chi ce l'ha e su quale centro di costo pesa
 * NON si scrivono qui: sono copie dell'assegnazione attiva e le riscrive
 * `lib/it/flusso.ts`. La data di cessazione si comporta da sé, come la
 * dismissione di un bene: passando a "Cessata" senza indicarla prende oggi.
 *
 * Protetta: area "IT e Dispositivi".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { aggiornaSim, getSimById, simConfigurate } from '@/lib/it/sim'
import { chiudiPerUscita } from '@/lib/it/flusso'
import {
  AREA_IT,
  STATI_SIM,
  STATI_SIM_CHIUSI,
  TIPI_PIANO,
  type ModificaSim,
  type StatoSim,
  type TipoPiano,
} from '@/types/it'

export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const testo = (v: unknown) => (v === undefined ? undefined : String(v ?? '').trim())
const data = (v: unknown) => (v === undefined ? undefined : v ? String(v).slice(0, 10) : null)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA_IT)
  if (g.error) return g.error
  if (!simConfigurate()) return err('Lista SIM non configurata', 503)

  const { id } = await params
  if (!id) return err('ID SIM mancante')

  let body: any
  try {
    body = await req.json()
  } catch {
    return err('Body non valido (atteso JSON)')
  }

  if (body.stato != null && !STATI_SIM.includes(body.stato as StatoSim)) {
    return err('Stato della SIM non valido.')
  }
  if (body.tipoPiano != null && !TIPI_PIANO.includes(body.tipoPiano as TipoPiano)) {
    return err('Tipo di piano non valido.')
  }
  if (body.numero !== undefined && !testo(body.numero)) return err('Il numero non può restare vuoto.')
  for (const campo of ['dataAttivazione', 'dataCessazione']) {
    const v = data(body[campo])
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return err(`Data non valida in ${campo}.`)
  }

  const mod: ModificaSim = {
    numero: testo(body.numero),
    operatore: testo(body.operatore),
    tipoPiano: body.tipoPiano as TipoPiano | undefined,
    nomePiano: testo(body.nomePiano),
    fornitore: testo(body.fornitore),
    dataAttivazione: data(body.dataAttivazione),
    dataCessazione: data(body.dataCessazione),
    riferimentoContratto: testo(body.riferimentoContratto),
    stato: body.stato as StatoSim | undefined,
    costoMensile:
      body.costoMensile === undefined ? undefined
        : body.costoMensile === '' || body.costoMensile === null ? null
        : Number(body.costoMensile),
    note: testo(body.note),
    beneAssociatoId:
      body.beneAssociatoId === undefined ? undefined : Number(body.beneAssociatoId) || null,
  }

  if (mod.costoMensile != null && (isNaN(mod.costoMensile) || mod.costoMensile < 0)) {
    return err('Costo mensile non valido.')
  }

  try {
    const prima = await getSimById(id)
    const sim = await aggiornaSim(prima, mod)

    // Una SIM cessata non può restare in carico a nessuno: stessa regola dei beni
    // che escono dal patrimonio.
    let assegnazioniChiuse = 0
    if (STATI_SIM_CHIUSI.includes(sim.stato) && !STATI_SIM_CHIUSI.includes(prima.stato)) {
      assegnazioniChiuse = await chiudiPerUscita('sim', Number(sim.spItemId), sim.dataCessazione)
    }

    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'it.aggiorna-sim',
      entita: 'Sim',
      entitaId: sim.numero,
      dettagli: {
        statoPrecedente: prima.stato,
        stato: sim.stato,
        campi: Object.entries(mod).filter(([, v]) => v !== undefined).map(([k]) => k),
        assegnazioniChiuse: assegnazioniChiuse || undefined,
      },
    })

    return NextResponse.json({ sim, assegnazioniChiuse })
  } catch (e: any) {
    console.error(`[PATCH /api/it/sim/${id}]`, e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}
