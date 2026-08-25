/**
 * PATCH /api/it/dispositivi/[id] — aggiorna i dati tecnici di un dispositivo.
 *
 * Accetta i campi di `AggiornaBeneITPayload`. La regola che decide cosa passa la
 * fa `lib/it/dispositivi.ts`: se il bene nasce da una richiesta d'acquisto,
 * fornitore, data, valore e garanzia restano della richiesta e qui vengono
 * rifiutati con un messaggio che spiega dove correggerli.
 *
 * Stato del bene, ubicazione e note restano sulla PATCH dell'inventario
 * (`/api/inventario/[id]`): sono di tutti i beni, non solo dei dispositivi.
 *
 * Protetta: area "IT e Dispositivi".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { logAzione } from '@/lib/core/audit'
import { inventarioConfigurato } from '@/lib/inventario/data'
import { aggiornaBeneIT } from '@/lib/it/dispositivi'
import { ErroreFlusso } from '@/lib/it/flusso'
import { AREA_IT, MODI_ACQUISIZIONE, TIPI_IT, type ModoAcquisizione, type TipoIT } from '@/types/it'
import type { AggiornaBeneITPayload } from '@/types/inventario'

export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

/** `undefined` = campo assente nel body, `null` = da svuotare. */
const testo = (v: unknown) => (v === undefined ? undefined : String(v ?? '').trim())
const numero = (v: unknown) =>
  v === undefined ? undefined : v === '' || v === null ? null : Number(v)
const data = (v: unknown) =>
  v === undefined ? undefined : v ? String(v).slice(0, 10) : null

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA_IT)
  if (g.error) return g.error
  if (!inventarioConfigurato()) return err('Inventario non configurato', 503)

  const { id } = await params
  if (!id) return err('ID bene mancante')

  let body: any
  try {
    body = await req.json()
  } catch {
    return err('Body non valido (atteso JSON)')
  }

  if (body.tipoIT != null && !TIPI_IT.includes(body.tipoIT as TipoIT)) {
    return err('Tipo di dispositivo non valido.')
  }
  if (body.acquisizione != null && !MODI_ACQUISIZIONE.includes(body.acquisizione as ModoAcquisizione)) {
    return err('Modo di acquisizione non valido.')
  }
  for (const campo of ['valore', 'canoneMensile', 'mesiGaranzia']) {
    const n = numero(body[campo])
    if (n != null && (isNaN(n) || n < 0)) return err(`Valore non valido per ${campo}.`)
  }
  // Una data scritta male non deve diventare un campo svuotato in silenzio:
  // meglio un 400 che una data di acquisto che sparisce senza che nessuno lo sappia.
  for (const campo of ['fineNoleggio', 'dataAcquisto', 'scadenzaGaranzia']) {
    const v = data(body[campo])
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return err(`Data non valida in ${campo}.`)
  }

  const payload: AggiornaBeneITPayload = {
    tipoIT: body.tipoIT === undefined ? undefined : (body.tipoIT as TipoIT) || null,
    sottoTipo: testo(body.sottoTipo),
    marca: testo(body.marca),
    modello: testo(body.modello),
    descrizione: testo(body.descrizione),
    numeroSerie: testo(body.numeroSerie),
    acquisizione: body.acquisizione as ModoAcquisizione | undefined,
    canoneMensile: numero(body.canoneMensile),
    fineNoleggio: data(body.fineNoleggio),
    garanzieAccessorie: testo(body.garanzieAccessorie),
    fatturaRif: testo(body.fatturaRif),
    firewallInstallato:
      typeof body.firewallInstallato === 'boolean' ? body.firewallInstallato : undefined,
    dataAcquisto: data(body.dataAcquisto),
    fornitore: testo(body.fornitore),
    valore: numero(body.valore),
    mesiGaranzia: numero(body.mesiGaranzia),
    scadenzaGaranzia: data(body.scadenzaGaranzia),
  }

  try {
    const bene = await aggiornaBeneIT(id, payload)
    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'it.aggiorna-dispositivo',
      entita: 'Dispositivo',
      entitaId: bene.numero,
      dettagli: {
        campi: Object.entries(payload)
          .filter(([, v]) => v !== undefined)
          .map(([k]) => k),
      },
    })
    return NextResponse.json({ bene })
  } catch (e: any) {
    if (e instanceof ErroreFlusso) return err(e.message, 409)
    console.error(`[PATCH /api/it/dispositivi/${id}]`, e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}
