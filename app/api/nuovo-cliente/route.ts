/**
 * POST /api/nuovo-cliente — registrazione di un cliente dal QR della cassa.
 *
 * **Pubblica**: niente login (vedi middleware.ts). Per questo:
 *  - non restituisce mai dati dell'anagrafica, solo l'esito;
 *  - scarta i robot con tre controlli leggeri: un campo nascosto che una
 *    persona non vede e non compila (`sito`), un tempo minimo fra apertura
 *    della pagina e invio (`t`), un limite di invii per indirizzo;
 *  - accetta solo richieste partite da una pagina dello stesso sito.
 *
 * Il limite per indirizzo vive nella memoria del processo, quindi con più
 * istanze serverless è indicativo, non una garanzia. Basta a fermare chi
 * preme «Salva» cento volte; per un attacco vero servirebbe altro.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { clientiConfigurato } from '@/lib/clienti/data'
import { registraCliente } from '@/lib/clienti/pubblico'
import {
  nuovoClienteVuoto,
  pulisciNuovoCliente,
  validaNuovoCliente,
  type NuovoClienteInput,
} from '@/types/nuovo-cliente'

export const dynamic = 'force-dynamic'

const TEMPO_MINIMO_MS = 4000
const FINESTRA_MS = 10 * 60 * 1000
const MAX_INVII = 8
const invii = new Map<string, number[]>()

function troppi(ip: string): boolean {
  const ora = Date.now()
  const recenti = (invii.get(ip) ?? []).filter((t) => ora - t < FINESTRA_MS)
  recenti.push(ora)
  invii.set(ip, recenti)
  return recenti.length > MAX_INVII
}

const CAMPI_TESTO: ReadonlyArray<keyof NuovoClienteInput> = [
  'tipoSoggetto', 'cognome', 'nome', 'ragioneSociale', 'partitaIva', 'codiceFiscale',
  'indirizzo', 'cap', 'citta', 'provincia', 'nazione', 'telefono', 'email', 'pec', 'codiceSdi',
]

export async function POST(req: NextRequest) {
  const origine = req.headers.get('origin')
  if (origine && new URL(origine).host !== req.nextUrl.host) {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 403 })
  }
  if (!clientiConfigurato()) {
    return NextResponse.json({ error: 'Servizio non disponibile' }, { status: 503 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  // Robot: si risponde «fatto» senza salvare niente, così non imparano cosa li ha traditi.
  const aperta = Number(body?.t)
  if (String(body?.sito ?? '').trim() || !Number.isFinite(aperta) || Date.now() - aperta < TEMPO_MINIMO_MS) {
    return NextResponse.json({ esito: 'creato' })
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'sconosciuto'
  if (troppi(ip)) {
    return NextResponse.json(
      { error: 'Troppi invii ravvicinati. Riprova fra qualche minuto.' },
      { status: 429 },
    )
  }

  // Solo i campi previsti, solo stringhe corte: il resto del body si ignora.
  const input = nuovoClienteVuoto()
  for (const k of CAMPI_TESTO) {
    ;(input as any)[k] = String(body?.dati?.[k] ?? '').slice(0, 200)
  }
  input.senzaPartitaIva = Boolean(body?.dati?.senzaPartitaIva)
  const pulito = pulisciNuovoCliente(input)

  const errori = validaNuovoCliente(pulito)
  if (Object.keys(errori).length) {
    return NextResponse.json({ error: 'Dati incompleti', errori }, { status: 400 })
  }

  try {
    const esito = await registraCliente(pulito, Boolean(body?.conferma))
    return NextResponse.json({ esito })
  } catch (err) {
    console.error('[POST /api/nuovo-cliente]', err)
    return NextResponse.json(
      { error: 'Non siamo riusciti a salvare i dati. Riprova fra poco.' },
      { status: 500 },
    )
  }
}
