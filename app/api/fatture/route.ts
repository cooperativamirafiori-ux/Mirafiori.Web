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
    const richiesta = await creaRichiestaFattura(input, {
      email: session.user.email,
      nome: session.user.name,
    })

    // La mail non deve poter far fallire una richiesta già salvata: se salta,
    // il dato è comunque nella lista.
    try {
      await notificaRichiestaFattura(richiesta)
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
      },
    })

    return NextResponse.json({ ok: true, numero: richiesta.numero }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/fatture]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
