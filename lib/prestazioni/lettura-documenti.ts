/**
 * Lettura automatica dei documenti d'identità con Claude (API Anthropic).
 *
 * Riceve i file del lotto "in arrivo" (già su SharePoint, vedi `in-arrivo.ts`),
 * li manda a Claude e ritorna i dati anagrafici per compilare il modulo.
 *
 * Scelte:
 * - **niente SDK**: una sola chiamata HTTP a /v1/messages, come per DocuSign;
 * - **uscita a schema fisso**: Claude "chiama" lo strumento `dati_documenti`,
 *   così la risposta è un JSON con i campi attesi. ⚠️ I modelli 5.x NON
 *   accettano tool_choice forzato ("tool"/"any" → 400, 20 ott 2026): si usa
 *   "auto" con l'istruzione esplicita, e se per caso risponde a testo si cerca
 *   il JSON nel testo;
 * - **mai inventare**: un dato non leggibile torna vuoto. Il modulo compila
 *   solo i campi vuoti e li segna da ricontrollare;
 * - foto troppo pesanti o in formati non supportati (HEIC, TIFF) passano dalla
 *   miniatura JPEG che genera SharePoint: nessuna libreria d'immagini qui.
 *
 * Env: ANTHROPIC_API_KEY (obbligatoria), ANTHROPIC_MODEL (facoltativa),
 * ANTHROPIC_WORKSPACE_ID (solo se la chiave non è creata dentro un workspace).
 */

import { scaricaFileInArrivo, miniaturaJpeg, type FileInArrivo } from './in-arrivo'
import { controllaCodiceFiscale } from './codice-fiscale'

const API_URL = 'https://api.anthropic.com/v1/messages'
const MODELLO_PREDEFINITO = 'claude-sonnet-5-5'

/** Immagini: l'API accetta fino a 5 MB l'una (dopo la codifica base64 crescono di 1/3). */
const MAX_IMMAGINE_BYTE = 3.7 * 1024 * 1024
/** PDF: tetto prudente sotto i 32 MB della richiesta intera. */
const MAX_PDF_BYTE = 20 * 1024 * 1024
const IMMAGINI_DIRETTE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function letturaConfigurata(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export interface DatiLetti {
  nome: string
  cognome: string
  dataNascita: string
  luogoNascita: string
  codiceFiscale: string
  residenza: string
}

export interface EsitoLettura {
  dati: DatiLetti
  /** Cosa ha riconosciuto in ciascun file, nell'ordine dei file */
  documenti: { file: string; tipo: string }[]
  /** Avvisi da mostrare al responsabile (dati incerti, CF incoerente, documento scaduto…) */
  avvisi: string[]
  uso: { input: number; output: number; modello: string }
}

const TIPI_DOCUMENTO = [
  'carta_identita',
  'tessera_sanitaria_codice_fiscale',
  'passaporto',
  'patente',
  'permesso_soggiorno',
  'altro',
] as const

const ETICHETTE_TIPO: Record<string, string> = {
  carta_identita: "Carta d'identità",
  tessera_sanitaria_codice_fiscale: 'Tessera sanitaria / codice fiscale',
  passaporto: 'Passaporto',
  patente: 'Patente',
  permesso_soggiorno: 'Permesso di soggiorno',
  altro: 'Altro documento',
}

const STRUMENTO = {
  name: 'dati_documenti',
  description: 'Registra i dati anagrafici letti dai documenti di identità.',
  input_schema: {
    type: 'object',
    properties: {
      nome: { type: 'string', description: 'Nome (o nomi) di battesimo, come sul documento, con iniziali maiuscole.' },
      cognome: { type: 'string', description: 'Cognome, come sul documento, con iniziali maiuscole.' },
      data_nascita: { type: 'string', description: 'Data di nascita in formato AAAA-MM-GG.' },
      luogo_nascita: {
        type: 'string',
        description: 'Comune di nascita con sigla provincia tra parentesi, es. "Torino (TO)". Se estero: città e Stato, es. "Tirana (Albania)".',
      },
      codice_fiscale: { type: 'string', description: 'Codice fiscale di 16 caratteri, maiuscolo, senza spazi.' },
      residenza: {
        type: 'string',
        description: 'Indirizzo di residenza nel formato "Via Roma 12, Torino (TO), 10100". Vuoto se nessun documento la riporta.',
      },
      scadenza_documento: {
        type: 'string',
        description: "Data di scadenza della carta d'identità (o del documento di riconoscimento principale) in AAAA-MM-GG, vuota se assente.",
      },
      documenti: {
        type: 'array',
        description: 'Per ogni file ricevuto, nell’ordine, cosa contiene. Un file può contenerne più di uno: indica quello principale.',
        items: {
          type: 'object',
          properties: {
            indice: { type: 'integer', description: 'Numero del file, a partire da 1.' },
            tipo: { type: 'string', enum: [...TIPI_DOCUMENTO] },
          },
          required: ['indice', 'tipo'],
        },
      },
      dubbi: {
        type: 'array',
        items: { type: 'string' },
        description: 'Frasi brevi in italiano sui dati poco leggibili o in contrasto tra due documenti. Vuoto se tutto è chiaro.',
      },
    },
    required: ['nome', 'cognome', 'data_nascita', 'luogo_nascita', 'codice_fiscale', 'residenza', 'documenti', 'dubbi'],
  },
} as const

const ISTRUZIONI = `Ricevi uno o più file con i documenti d'identità di una persona (carta d'identità italiana cartacea o elettronica, tessera sanitaria / codice fiscale, eventualmente passaporto, patente o permesso di soggiorno). Un file può contenere più documenti, anche fronte e retro.

Estrai i dati anagrafici e chiama lo strumento dati_documenti.

Regole:
- Non inventare e non dedurre: se un dato non è leggibile con certezza, lascialo vuoto ("") e spiegalo in "dubbi".
- Il codice fiscale va copiato carattere per carattere; se è presente su più documenti, confrontali.
- La residenza compare di solito sulla carta d'identità (sul retro della CIE o all'interno della carta cartacea). Non usare indirizzi di altro tipo.
- Se i documenti sembrano appartenere a persone diverse, segnalalo in "dubbi".
- Rispondi SEMPRE e SOLO chiamando lo strumento dati_documenti, senza testo prima o dopo.`

/** Prepara un blocco di contenuto per un file, o null se non è utilizzabile. */
async function bloccoPerFile(f: FileInArrivo): Promise<{ blocco: any | null; avviso?: string }> {
  const mime = (f.mimeType || '').toLowerCase()
  const isPdf = mime === 'application/pdf' || f.nome.toLowerCase().endsWith('.pdf')

  if (isPdf) {
    if (f.dimensione > MAX_PDF_BYTE) {
      return { blocco: null, avviso: `${f.nome}: PDF troppo pesante per la lettura automatica.` }
    }
    const b = await scaricaFileInArrivo(f.id)
    return {
      blocco: {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: b.toString('base64') },
      },
    }
  }

  if (IMMAGINI_DIRETTE.includes(mime) && f.dimensione <= MAX_IMMAGINE_BYTE) {
    const b = await scaricaFileInArrivo(f.id)
    return {
      blocco: { type: 'image', source: { type: 'base64', media_type: mime, data: b.toString('base64') } },
    }
  }

  // Foto pesante o formato non supportato: miniatura JPEG di SharePoint
  const mini = await miniaturaJpeg(f.id)
  if (mini && mini.length <= MAX_IMMAGINE_BYTE) {
    return {
      blocco: { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: mini.toString('base64') } },
    }
  }
  return { blocco: null, avviso: `${f.nome}: formato non leggibile in automatico (usa PDF, JPG o PNG).` }
}

/** Dati dalla chiamata allo strumento; in mancanza, dal primo JSON nel testo. */
function estraiDati(content: any[]): any | null {
  const chiamata = content.find((c) => c?.type === 'tool_use' && c.name === STRUMENTO.name)
  if (chiamata?.input && typeof chiamata.input === 'object') return chiamata.input
  const testo = content.filter((c) => c?.type === 'text').map((c) => c.text).join('\n')
  const inizio = testo.indexOf('{')
  const fine = testo.lastIndexOf('}')
  if (inizio < 0 || fine <= inizio) return null
  try {
    return JSON.parse(testo.slice(inizio, fine + 1))
  } catch {
    return null
  }
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export async function leggiDocumentiIdentita(files: FileInArrivo[]): Promise<EsitoLettura> {
  const chiave = process.env.ANTHROPIC_API_KEY
  if (!chiave) throw new Error('Lettura automatica non attiva: manca ANTHROPIC_API_KEY.')
  const modello = process.env.ANTHROPIC_MODEL || MODELLO_PREDEFINITO

  const avvisi: string[] = []
  const contenuto: any[] = []
  const usati: FileInArrivo[] = []
  for (const f of files) {
    const { blocco, avviso } = await bloccoPerFile(f)
    if (avviso) avvisi.push(avviso)
    if (!blocco) continue
    usati.push(f)
    contenuto.push({ type: 'text', text: `File ${usati.length}:` }, blocco)
  }
  if (!usati.length) {
    throw new Error(avvisi[0] ?? 'Nessun documento leggibile.')
  }
  contenuto.push({ type: 'text', text: 'Estrai i dati e chiama lo strumento dati_documenti.' })

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': chiave,
      'anthropic-version': '2023-06-01',
      // Solo per chiavi non legate a un workspace (vedi docs)
      ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : {}),
    },
    body: JSON.stringify({
      model: modello,
      max_tokens: 1500,
      system: ISTRUZIONI,
      tools: [STRUMENTO],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: contenuto }],
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const testo = await res.text().catch(() => '')
    // Non loggare mai il corpo della richiesta: contiene i documenti.
    console.error('[lettura-documenti] Anthropic', res.status, testo.slice(0, 300))
    if (res.status === 401) throw new Error('Chiave API Anthropic non valida.')
    if (res.status === 429 || res.status === 529) throw new Error('Servizio di lettura occupato: riprova tra un minuto.')
    let motivo = ''
    try {
      motivo = JSON.parse(testo)?.error?.message ?? ''
    } catch {}
    throw new Error(`Lettura automatica non riuscita (${res.status}${motivo ? `: ${motivo.slice(0, 160)}` : ''}).`)
  }

  const data = await res.json()
  const uso = data.usage
  const x = estraiDati(data.content ?? [])
  if (!x) {
    console.error('[lettura-documenti] risposta senza dati, stop_reason:', data.stop_reason)
    throw new Error('Claude non ha restituito i dati: riprova con "Rileggi i documenti".')
  }

  const dati: DatiLetti = {
    nome: s(x.nome),
    cognome: s(x.cognome),
    dataNascita: /^\d{4}-\d{2}-\d{2}$/.test(s(x.data_nascita)) ? s(x.data_nascita) : '',
    luogoNascita: s(x.luogo_nascita),
    codiceFiscale: s(x.codice_fiscale).toUpperCase().replace(/\s+/g, ''),
    residenza: s(x.residenza),
  }

  if (Array.isArray(x.dubbi)) for (const d of x.dubbi) if (s(d)) avvisi.push(s(d))

  if (dati.codiceFiscale) {
    avvisi.push(...controllaCodiceFiscale(dati.codiceFiscale, dati).avvisi)
  }

  const scadenza = s(x.scadenza_documento)
  if (/^\d{4}-\d{2}-\d{2}$/.test(scadenza) && scadenza < new Date().toISOString().slice(0, 10)) {
    const [a, m, g] = scadenza.split('-')
    avvisi.push(`Il documento d'identità risulta scaduto il ${g}/${m}/${a}: chiedine uno valido.`)
  }

  const documenti = Array.isArray(x.documenti)
    ? x.documenti
        .filter((d: any) => Number.isInteger(d?.indice) && usati[d.indice - 1])
        .map((d: any) => ({ file: usati[d.indice - 1].nome, tipo: ETICHETTE_TIPO[d.tipo] ?? 'Altro documento' }))
    : []

  return {
    dati,
    documenti,
    avvisi: Array.from(new Set(avvisi)),
    uso: { input: uso?.input_tokens ?? 0, output: uso?.output_tokens ?? 0, modello },
  }
}
