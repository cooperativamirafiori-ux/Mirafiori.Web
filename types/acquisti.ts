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

/**
 * Mesi di garanzia proposti per default sui beni da inventariare.
 *
 * Resta un default modificabile ordine per ordine: certe attrezzature ne hanno 24
 * o 36, e la scadenza calcolata deve poter seguire il contratto vero.
 */
export const MESI_GARANZIA_DEFAULT = 12

/** Esiti che il richiedente può scegliere: sono i due pulsanti della mail. */
export const ESITI_CONSEGNA = ['Tutto ok', 'Da restituire'] as const
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
  /**
   * **Servizio**: dove va consegnata la merce. Non lo indica chi chiede, lo
   * scegle chi prende in carico la richiesta — quindi fino alla presa in carico
   * è `{ id: 0, value: '' }`. Chi chiede spesso non sa dove conviene far
   * arrivare il pacco: dipende da fornitore, presidio e tempi.
   */
  struttura: { id: number; value: string }
  /**
   * Chi paga. Lo indica il richiedente: è l'unico dato di imputazione che
   * conosce con certezza (l'educativa nelle scuole imputa la spesa a sé, anche
   * se la merce arriva in ufficio).
   */
  centroCosto?: { id: number; value: string }
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
  totale?: number
  dataOrdine?: string
  pagamento?: string
  dataPagamento?: string
  dataConsegnaPrevista?: string
  /**
   * Storico. Fino ad agosto 2026 il luogo di consegna si ridigitava alla
   * registrazione dell'ordine, doppiando `struttura`: oggi il servizio è uno
   * solo e si sceglie alla presa in carico. Resta letto per i record vecchi.
   */
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
  mesiGaranzia?: number
  scadenzaGaranzia?: string
  /** Numeri di inventario generati da questa richiesta, es. "INV-0007, INV-0008". */
  numeriInventario?: string
  inventarioGenerato: boolean

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
  /** Chi paga: l'unico dato di imputazione chiesto al richiedente. */
  centroCostoId: number
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
  | 'servizio'
  | 'approva'
  | 'rifiuta'
  | 'ordina'
  | 'pagamento'
  | 'esito'
  | 'risolvi'
  | 'annulla'
  | 'note'

export interface AggiornaAcquistoPayload {
  azione: AzioneAcquisto
  /**
   * Servizio di consegna. Obbligatorio su `prendi-in-carico` e `assegna` se la
   * richiesta non ne ha ancora uno; con `servizio` lo si cambia più tardi.
   */
  strutturaId?: number
  // assegna
  assegnatoEmail?: string
  // rifiuta / annulla
  motivo?: string
  // ordina
  fornitore?: string
  imponibile?: number
  totale?: number
  dataOrdine?: string
  pagamento?: string
  dataConsegnaPrevista?: string
  daInventariare?: boolean
  marcaModello?: string
  numeroSerie?: string
  extraCee?: boolean
  mesiGaranzia?: number
  /**
   * Un numero di serie per pezzo, nell'ordine in cui vengono inventariati.
   * Se più corto della quantità, i pezzi restanti nascono senza seriale.
   */
  serialiInventario?: string[]
  // pagamento
  dataPagamento?: string
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

/**
 * IVA come differenza fra totale e imponibile.
 *
 * L'aliquota non viene più chiesta né salvata: chi registra l'ordine ha la
 * fattura davanti e digita i due importi che vi legge. Ricavare l'IVA per
 * differenza vale anche per i record vecchi, dove il totale era calcolato
 * dall'aliquota: nessuna migrazione dei dati.
 */
export function calcolaIva(imponibile?: number | null, totale?: number | null): number {
  const imp = Number(imponibile) || 0
  const tot = Number(totale) || 0
  return Math.round((tot - imp) * 100) / 100
}

/**
 * Aggiunge mesi a una data ISO, senza sforare la fine del mese.
 *
 * `new Date(2026, 0, 31)` + 1 mese darebbe 3 marzo in JS: qui il 31 gennaio
 * + 1 mese resta il 28 (o 29) febbraio, che è come si contano le garanzie.
 */
export function aggiungiMesi(isoOYmd: string, mesi: number): string | undefined {
  const solo = String(isoOYmd ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(solo)) return undefined
  const n = Number(mesi)
  if (!isFinite(n)) return undefined

  const [anno, mese, giorno] = solo.split('-').map(Number)
  const totaleMesi = (anno * 12 + (mese - 1)) + Math.round(n)
  const nuovoAnno = Math.floor(totaleMesi / 12)
  const nuovoMese = totaleMesi % 12
  const ultimoGiorno = new Date(Date.UTC(nuovoAnno, nuovoMese + 1, 0)).getUTCDate()
  const nuovoGiorno = Math.min(giorno, ultimoGiorno)

  return `${String(nuovoAnno).padStart(4, '0')}-${String(nuovoMese + 1).padStart(2, '0')}-${String(nuovoGiorno).padStart(2, '0')}`
}

/** Giorni da oggi alla data indicata: negativo se è già passata. */
export function giorniA(iso?: string | null): number | undefined {
  if (!iso) return undefined
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z')
  if (isNaN(d.getTime())) return undefined
  const oggi = new Date()
  const oggiUtc = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate(), 12)
  return Math.round((d.getTime() - oggiUtc) / 86_400_000)
}

export type StatoGaranzia =
  | { stato: 'assente' }
  | { stato: 'attiva'; giorni: number }
  | { stato: 'in-scadenza'; giorni: number }
  | { stato: 'scaduta'; giorni: number }

/** Soglia oltre la quale la garanzia si segnala come "in scadenza". */
export const GIORNI_PREAVVISO_GARANZIA = 60

export function statoGaranzia(scadenza?: string | null): StatoGaranzia {
  const g = giorniA(scadenza)
  if (g === undefined) return { stato: 'assente' }
  if (g < 0) return { stato: 'scaduta', giorni: g }
  if (g <= GIORNI_PREAVVISO_GARANZIA) return { stato: 'in-scadenza', giorni: g }
  return { stato: 'attiva', giorni: g }
}

export const GARANZIA_STILE: Record<string, string> = {
  'attiva': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'in-scadenza': 'bg-amber-50 text-amber-700 border-amber-200',
  'scaduta': 'bg-gray-100 text-gray-500 border-gray-200',
  'assente': 'bg-gray-100 text-gray-500 border-gray-200',
}

export function etichettaGaranzia(scadenza?: string | null): string {
  const s = statoGaranzia(scadenza)
  switch (s.stato) {
    case 'assente':
      return 'garanzia non calcolata'
    case 'scaduta':
      return `garanzia scaduta il ${dataBreve(scadenza)}`
    case 'in-scadenza':
      return s.giorni === 0
        ? 'garanzia scade oggi'
        : `garanzia scade fra ${s.giorni} ${s.giorni === 1 ? 'giorno' : 'giorni'}`
    default:
      return `in garanzia fino al ${dataBreve(scadenza)}`
  }
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
 * true se il luogo di consegna della richiesta corrisponde alla struttura
 * indicata da `token` (confronto per inclusione, senza accenti né maiuscole).
 *
 * Sta qui e non in lib/ perché serve anche al client, che non può leggere le
 * variabili d'ambiente: chi la chiama passa il token, la funzione resta pura.
 * L'inclusione, e non l'uguaglianza, regge le etichette lunghe tipo
 * "Sede operativa Strada del Drosso 143".
 */
export function luogoCorrisponde(a: RichiestaAcquisto, token: string): boolean {
  const pulisci = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  const cercato = pulisci(token)
  if (!cercato) return false
  const luogo = pulisci(servizioDiConsegna(a))
  return luogo.includes(cercato)
}

/** Segnaposto per una richiesta non ancora presa in carico. */
export const SERVIZIO_DA_DEFINIRE = 'servizio da definire'

/**
 * Servizio di consegna della richiesta.
 *
 * Legge `struttura` e ripiega su `luogoConsegna` per i record nati prima di
 * agosto 2026, quando il luogo si ridigitava alla registrazione dell'ordine.
 * Stringa vuota se nessuno l'ha ancora scelto.
 */
export function servizioDiConsegna(a: RichiestaAcquisto): string {
  return a.struttura.value || a.luogoConsegna?.value || ''
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
