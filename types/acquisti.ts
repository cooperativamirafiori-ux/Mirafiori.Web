// ============================================================
// Richieste Acquisto — tipi e costanti
//
// Lista SharePoint "Richieste Acquisto" (SP_LIST_ACQUISTI).
// Le strutture NON hanno un'anagrafica propria: si riusa la lista Strutture
// già alimentata dalle manutenzioni, sia come servizio di riferimento sia
// come luogo di consegna.
// ============================================================

export const STATI_ACQUISTO = [
  'Inviata',
  'Presa in carico',
  'Approvata',
  'Non approvata',
  'Ordinata',
  'Consegnata',
  'Problema',
  'Annullata',
] as const
export type StatoAcquisto = (typeof STATI_ACQUISTO)[number]

/** Stati in cui la richiesta è ancora "viva" per chi gestisce gli acquisti. */
export const STATI_APERTI: StatoAcquisto[] = [
  'Inviata',
  'Presa in carico',
  'Approvata',
  'Ordinata',
  'Problema',
]

export const URGENZE = ['Normale', 'Alta', 'Urgente'] as const
export type Urgenza = (typeof URGENZE)[number]

export const CATEGORIE_SPESA = [
  'Materiale di consumo',
  'Attrezzatura',
  'Arredi',
  'Informatica',
  'Cancelleria',
  'Pulizia e igiene',
  'Alimentari',
  'DPI e sicurezza',
  'Manutenzione',
  'Servizi',
  'Altro',
] as const
export type CategoriaSpesa = (typeof CATEGORIE_SPESA)[number]

export const MODALITA_PAGAMENTO = [
  'Fattura posticipata',
  'Bonifico',
  'Carta',
  'Contanti',
] as const

export const ALIQUOTE_IVA = [22, 10, 4, 0] as const

/** Esiti che il richiedente può scegliere: sono i tre pulsanti della mail. */
export const ESITI_CONSEGNA = ['Tutto ok', 'Da restituire', 'Non arrivato'] as const
export type EsitoConsegna = (typeof ESITI_CONSEGNA)[number]

/**
 * Esito scritto dalla chiusura d'ufficio, non selezionabile da nessuno.
 *
 * Tenuto distinto da "Tutto ok" di proposito: la richiesta viene chiusa perché
 * nessuno ha risposto, non perché qualcuno ha verificato. Nei report le due
 * cose non vanno confuse.
 */
export const ESITO_SENZA_RISCONTRO = 'Consegnata senza riscontro'

/** Tutti i valori ammessi dalla colonna Choice EsitoConsegna su SharePoint. */
export const ESITI_SP = [...ESITI_CONSEGNA, ESITO_SENZA_RISCONTRO] as const

/** Giorni dopo la consegna prevista oltre i quali si sollecita il richiedente. */
export const GIORNI_SOLLECITO = 3
/** Giorni dopo la consegna prevista oltre i quali la richiesta si chiude d'ufficio. */
export const GIORNI_AUTOCHIUSURA = 10

// ============================================================
// Record
// ============================================================

export interface RichiestaAcquisto {
  spItemId: string
  codice: string // Title, es. "ACQ-2026-001"

  // Richiesta
  richiedenteNome: string
  richiedenteLookupId: number
  dataRichiesta: string
  struttura: { id: number; value: string }
  descrizione: string
  quantita: number
  link?: string
  urgenza: string
  serveEntro?: string
  categoria: string

  // Gestione
  stato: StatoAcquisto
  assegnatoNome?: string
  assegnatoLookupId?: number
  motivoRifiuto?: string
  noteInterne?: string

  // Ordine
  fornitore?: string
  imponibile?: number
  aliquotaIva?: number
  totale?: number
  dataOrdine?: string
  pagamento?: string
  dataConsegnaPrevista?: string
  luogoConsegna?: { id: number; value: string }

  // Consegna
  dataConsegnaEffettiva?: string
  esitoConsegna?: string
  noteEsito?: string

  // Inventario / fiscale
  daInventariare: boolean
  marcaModello?: string
  numeroSerie?: string
  extraCee: boolean

  // Interni al flusso
  confermaToken?: string
  notificaConsegnaInviata: boolean
  sollecitoInviato: boolean
  costoGenerato: boolean
  digestInviato: boolean
}

// ============================================================
// Payload API
// ============================================================

export interface NuovaRichiestaAcquistoPayload {
  strutturaId: number
  descrizione: string
  quantita: number
  link?: string
  urgenza: string
  serveEntro?: string
  categoria: string
}

export type AzioneAcquisto =
  | 'prendi-in-carico'
  | 'assegna'
  | 'approva'
  | 'rifiuta'
  | 'ordina'
  | 'esito'
  | 'risolvi'
  | 'annulla'
  | 'note'

export interface AggiornaAcquistoPayload {
  azione: AzioneAcquisto
  // assegna
  assegnatoEmail?: string
  // rifiuta / annulla
  motivo?: string
  // ordina
  fornitore?: string
  imponibile?: number
  aliquotaIva?: number
  dataOrdine?: string
  pagamento?: string
  dataConsegnaPrevista?: string
  luogoConsegnaId?: number
  daInventariare?: boolean
  marcaModello?: string
  numeroSerie?: string
  extraCee?: boolean
  // esito
  esito?: EsitoConsegna
  noteEsito?: string
  // note
  noteInterne?: string
}

// ============================================================
// Helper di presentazione
// ============================================================

export const STATO_STILE: Record<string, { badge: string; dot: string }> = {
  'Inviata':         { badge: 'bg-blue-50 text-blue-700 border-blue-200',       dot: 'bg-blue-500' },
  'Presa in carico': { badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
  'Approvata':       { badge: 'bg-amber-50 text-amber-700 border-amber-200',    dot: 'bg-amber-500' },
  'Non approvata':   { badge: 'bg-gray-100 text-gray-600 border-gray-200',      dot: 'bg-gray-400' },
  'Ordinata':        { badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  'Consegnata':      { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  'Problema':        { badge: 'bg-red-50 text-red-700 border-red-200',          dot: 'bg-red-500' },
  'Annullata':       { badge: 'bg-gray-100 text-gray-500 border-gray-200',      dot: 'bg-gray-300' },
}

export const URGENZA_STILE: Record<string, string> = {
  'Normale': 'bg-gray-100 text-gray-600',
  'Alta':    'bg-orange-100 text-orange-700',
  'Urgente': 'bg-red-100 text-red-700 font-bold',
}

/** Totale da imponibile e aliquota, arrotondato ai centesimi. */
export function calcolaTotale(imponibile: number, aliquotaIva: number): number {
  const imp = Number(imponibile) || 0
  const iva = Number(aliquotaIva) || 0
  return Math.round(imp * (1 + iva / 100) * 100) / 100
}

export const euro = (n?: number | null) =>
  (Number(n) || 0).toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  })

export const dataBreve = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('it-IT')
}

/**
 * Normalizza un nome fornitore per il confronto: serve a evitare che
 * "Amazon", "amazon srl " e "AMAZON" diventino tre fornitori distinti.
 */
export function normalizzaFornitore(nome: string): string {
  return nome
    .toLowerCase()
    .replace(/\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
