/**
 * POST /api/fatture — registra una richiesta di fattura.
 *
 * Accesso: qualsiasi utente autenticato. La sezione è aperta a tutta la
 * cooperativa di proposito (chi sta in sala al ristorante deve poterla usare),
 * quindi qui non si controlla nessun permesso d'area: basta la sessione.
 *
 * Il richiedente NON arriva dal body ma dalla sessione: è l'unico modo perché
 * sia davvero l'identità di chi ha compilato.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { logAzione } from '@/lib/core/audit'
import { creaRichiestaFattura, fattureConfigurato } from '@/lib/fatture/data'
import { notificaRichiestaFattura } from '@/lib/fatture/notifiche'
import { clientiConfigurato, salvaCliente } from '@/lib/clienti/data'
import { intestatario, richiestaVuota, validaRichiesta } from '@/types/fatture'
import type { NuovaRichiestaFatturaInput } from '@/types/fatture'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  if (!fattureConfigurato()) {
    return NextResponse.json(
      { error: 'Sezione non configurata: manca SP_LIST_FATTURE' },
      { status: 503 },
    )
  }

  let body: Partial<NuovaRichiestaFatturaInput>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  // I campi mancanti diventano stringhe vuote: la validazione li tratta come
  // "non compilati" invece di far esplodere il .trim().
  const input: NuovaRichiestaFatturaInput = {
    ...richiestaVuota(),
    ...body,
    condominio: Boolean(body.condominio),
  }

  const errori = validaRichiesta(input)
  if (Object.keys(errori).length) {
    return NextResponse.json(
      { error: 'Dati incompleti o non validi', errori },
      { status: 400 },
    )
  }

  try {
    // Prima l'anagrafica, poi la richiesta: così la richiesta può portarsi
    // l'id del cliente, anche quando il cliente è nato adesso. Se l'anagrafica
    // dà problemi la richiesta si salva comunque — è lei che non si può perdere.
    let anagrafica: Awaited<ReturnType<typeof salvaCliente>> | undefined
    if (clientiConfigurato()) {
      try {
        anagrafica = await salvaCliente(
          {
            denominazione: intestatario(input),
            cognome: input.cognome,
            nome: input.nome,
            tipoSoggetto: input.tipoSoggetto,
            indirizzo: input.indirizzo,
            comune: input.citta,
            cap: input.cap,
            provincia: input.provincia,
            nazione: input.nazione,
            partitaIva: input.partitaIva,
            codiceFiscale: input.codiceFiscale,
            telefono: input.telefono,
            email: input.email,
            pec: input.pec,
            codiceSdi: input.codiceSdi,
          },
          input.clienteId || undefined,
        )
        input.clienteId = anagrafica.cliente.spItemId
      } catch (err) {
        console.error('[POST /api/fatture] anagrafica cliente non salvata', err)
      }
    }

    const richiesta = await creaRichiestaFattura(input, {
      email: session.user.email,
      nome: session.user.name,
    })

    // La mail non deve poter far fallire una richiesta già salvata: se salta,
    // il dato è comunque nella lista.
    try {
      await notificaRichiestaFattura(richiesta, anagrafica)
    } catch (err) {
      console.error('[POST /api/fatture] notifica fallita (richiesta salvata)', err)
    }

    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: 'fattura.richiedi',
      entita: 'RichiestaFattura',
      entitaId: richiesta.numero,
      // Niente codice fiscale né partita IVA nel log: sono dati del cliente e
      // qui non servono a ricostruire chi ha fatto cosa.
      dettagli: {
        centroCosto: richiesta.centroCosto,
        tipoSoggetto: richiesta.tipoSoggetto,
        intestatario: intestatario(richiesta),
        importo: richiesta.importo,
        cliente: anagrafica
          ? { id: anagrafica.cliente.spItemId, esito: anagrafica.esito, campi: anagrafica.cambiati.map((c) => c.campo) }
          : undefined,
      },
    })

    return NextResponse.json(
      {
        ok: true,
        numero: richiesta.numero,
        cliente: anagrafica ? { esito: anagrafica.esito, cambiati: anagrafica.cambiati.length } : undefined,
      },
      { status: 201 },
    )
  } catch (err: any) {
    console.error('[POST /api/fatture]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
