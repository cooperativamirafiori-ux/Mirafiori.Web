/**
 * POST /api/prestazioni/in-arrivo/leggi
 *
 * Legge con Claude i documenti d'identità del lotto (già su SharePoint) e
 * ritorna i dati per compilare il modulo. Non salva niente: i dati restano
 * solo nella risposta, il responsabile li ricontrolla e poi salva.
 *
 * Body JSON: { lotto: string }
 * Risposta:  { dati, documenti, avvisi }
 *
 * Nel Log Attività finisce solo QUANTI file e quanti token, mai i dati letti.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { logAzione } from '@/lib/core/audit'
import { fileInArrivo, lottoValido } from '@/lib/prestazioni/in-arrivo'
import { leggiDocumentiIdentita, letturaConfigurata } from '@/lib/prestazioni/lettura-documenti'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  if (!letturaConfigurata()) {
    return NextResponse.json(
      { error: 'Lettura automatica non attiva: compila i campi a mano.' },
      { status: 503 },
    )
  }

  let lotto: unknown
  try {
    lotto = (await req.json())?.lotto
  } catch {
    return NextResponse.json({ error: 'Body non valido (atteso JSON)' }, { status: 400 })
  }
  if (!lottoValido(lotto)) {
    return NextResponse.json({ error: 'Lotto non valido' }, { status: 400 })
  }

  try {
    const files = await fileInArrivo(lotto)
    if (!files.length) {
      return NextResponse.json({ error: 'Nessun documento caricato.' }, { status: 400 })
    }

    const esito = await leggiDocumentiIdentita(files)

    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: 'prestazione.lettura-documenti',
      entita: 'PrestazioneOccasionale',
      entitaId: lotto,
      dettagli: {
        file: files.length,
        modello: esito.uso.modello,
        tokenInput: esito.uso.input,
        tokenOutput: esito.uso.output,
      },
    })

    return NextResponse.json({
      dati: esito.dati,
      documenti: esito.documenti.map((d) => ({ ...d, file: d.file.replace(/^\d+_/, '') })),
      avvisi: esito.avvisi,
    })
  } catch (err: any) {
    console.error('[POST /api/prestazioni/in-arrivo/leggi]', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
