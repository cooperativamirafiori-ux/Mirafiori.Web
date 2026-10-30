/**
 * La domanda firmata, caricata dal browser direttamente su SharePoint.
 *
 *   POST — apre la sessione di caricamento in SOCI/Soci_<anno>/AMMISSIONI SOCI
 *   PUT  — conferma il caricamento e REGISTRA il nuovo socio (lib/soci/flusso.ts)
 *
 * Se la registrazione si ferma a metà, la domanda resta "Firmata" con il suo
 * numero già assegnato e il browser propone di riprovare (POST .../registra).
 */

import { NextRequest, NextResponse } from 'next/server'
import { logAzione } from '@/lib/core/audit'
import { MAX_UPLOAD_BYTES, maxUploadMb } from '@/lib/core/upload-diretto'
import { creaSessioneUploadInCartella, fileInCartella, getItem } from '@/lib/risorse-umane/data'
import { aggiornaDomanda, graphSoci } from '@/lib/soci/data'
import { cartellaAmmissioni, nomeDomandaFirmata } from '@/lib/soci/documento'
import { MSG_GIA_SOCIO, giaSocioPerAltro, oggiIso, registraSocio } from '@/lib/soci/flusso'
import { errore, guardDomanda } from '@/lib/soci/guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ESTENSIONI = ['pdf', 'jpg', 'jpeg', 'png', 'heic']
const anno = () => Number(oggiIso().slice(0, 4))

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g0 = await guardDomanda(id)
  if (g0.risposta) return g0.risposta
  const d = g0.domanda
  if (d.stato === 'Registrata') return errore('La domanda è già registrata.', 409)

  let body: { filename?: string; dimensione?: number }
  try {
    body = await req.json()
  } catch {
    return errore('Richiesta non valida')
  }
  const ext = (body.filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  if (!ESTENSIONI.includes(ext)) return errore('Carica il PDF della domanda firmata (o una foto JPG/PNG).')
  if (Number(body.dimensione) > MAX_UPLOAD_BYTES) return errore(`File troppo grande: il massimo è ${maxUploadMb()} MB.`)

  try {
    const g = graphSoci()
    const scheda = d.ruItemId ? await getItem(g, 'dipendenti', d.ruItemId).catch(() => null) : null
    if (giaSocioPerAltro(scheda, d)) return errore(MSG_GIA_SOCIO, 409)
    const sessione = await creaSessioneUploadInCartella(g, cartellaAmmissioni(anno()), nomeDomandaFirmata(d.dati, ext))
    return NextResponse.json(sessione)
  } catch (e: any) {
    console.error(`[POST /api/soci/domanda/${id}/firmata]`, e)
    return errore('Non riesco ad aprire il caricamento: riprova fra poco.', 500)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g0 = await guardDomanda(id)
  if (g0.risposta) return g0.risposta
  const { session } = g0
  let d = g0.domanda
  if (d.stato === 'Registrata') {
    return NextResponse.json({ numero: d.numeroElencoGenerale, stato: d.stato })
  }

  let body: { nomeFile?: string }
  try {
    body = await req.json()
  } catch {
    return errore('Richiesta non valida')
  }
  const nomeFile = (body.nomeFile ?? '').trim()
  // Il nome lo decide il server all'apertura (eventuale " 1" se esisteva già):
  // qui si accetta solo un nome di quella forma, mai un file qualsiasi.
  const atteso = nomeDomandaFirmata(d.dati, 'pdf').replace(/\.pdf$/, '')
  if (!nomeFile.startsWith(atteso)) return errore('File non riconosciuto', 400)

  const g = graphSoci()
  const file = await fileInCartella(g, cartellaAmmissioni(anno()), nomeFile)
  if (!file) return errore('Il file non risulta caricato: riprova.', 409)

  d = await aggiornaDomanda(g, d.spItemId, { stato: 'Firmata', domandaUrl: file.url, domandaNome: file.nome })
  await logAzione({
    utente: session.user.email,
    nome: session.user.name,
    azione: 'soci.domanda.firmata',
    entita: 'Domanda ammissione socio',
    entitaId: d.spItemId,
  })

  try {
    const esito = await registraSocio(g, d, { email: session.user.email!, nome: session.user.name })
    return NextResponse.json({ numero: esito.numero, stato: 'Registrata' })
  } catch (e: any) {
    console.error(`[PUT /api/soci/domanda/${id}/firmata] registrazione`, e)
    await aggiornaDomanda(g, d.spItemId, { esito: `Registrazione non riuscita: ${e?.message ?? e}` }).catch(() => {})
    return errore(
      `La domanda firmata è arrivata, ma la registrazione non si è completata: ${e?.message ?? 'errore interno'}`,
      500,
      { firmata: true },
    )
  }
}
