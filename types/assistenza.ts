// ============================================================
// Assistenza IT — tipi e costanti
//
// Lista SharePoint "Assistenza IT" (SP_LIST_ASSISTENZA), sul sito principale.
//
// Perché non la lista "Registro Assistenza IT" già presente su gruppo_it: è
// vuota, il suo lookup punta a una colonna `IDDispositivo` che non esiste più
// (è rotta) e da quel sito non si può fare lookup verso Inventario Beni, che
// vive qui. Le scelte delle tendine sono però le stesse scritte a suo tempo
// dall'ufficio IT: il vocabolario non cambia, cambia dove sta la lista.
// Quella vecchia resta come archivio, insieme alle altre quattro.
//
// Rapporto con l'area IT (types/it.ts): questa è la coda del lavoro, quella è
// l'anagrafica dei beni. Si toccano in un punto solo, il lookup `Bene`.
// ============================================================

import { AREA_IT } from '@/types/it'

/**
 * Permesso che apre la scrivania di chi lavora i ticket.
 *
 * È lo stesso dell'area IT, non uno nuovo: le persone sono le stesse e due
 * interruttori per la stessa squadra divergono al primo cambio di organico.
 * Aprire una richiesta invece non richiede nessun permesso — la sezione è di
 * tutti, come Richiesta fattura.
 */
export const AREA_ASSISTENZA = AREA_IT

export const STATI_ASSISTENZA = [
  'Inviata',
  'Presa in carico',
  'In lavorazione',
  'Attesa fornitore',
  'Attesa utente',
  'Risolta',
  'Annullata',
] as const
export type StatoAssistenza = (typeof STATI_ASSISTENZA)[number]

/** Stati in cui il ticket è ancora sul tavolo di chi fa assistenza. */
export const STATI_APERTI: StatoAssistenza[] = [
  'Inviata',
  'Presa in carico',
  'In lavorazione',
  'Attesa fornitore',
  'Attesa utente',
]

/** Stati in cui la palla è al richiedente, non all'IT. */
export const STATI_ATTESA_UTENTE: StatoAssistenza[] = ['Attesa utente']

/**
 * Tipologia della richiesta. Stessi valori della lista storica dell'IT
 * (colonna `Categoria`, etichetta "Tipologia Richiesta").
 */
export const TIPOLOGIE = [
  'Guasto/Problema',
  'Assistenza configurazioni',
  'Richiesta nuovo dispositivo',
  'Richiesta licenza/software',
  'Altro',
] as const
export type Tipologia = (typeof TIPOLOGIE)[number]

/** Su cosa: stessi valori della colonna `CategoriaRichiesta` storica. */
export const CATEGORIE = [
  'PC/Laptop',
  'Smartphone/Tablet',
  'Sim/Telefonia',
  'Stampante/Periferiche',
  'Rete/Wi Fi',
  'Software / Licenze',
  'Altro',
] as const
export type Categoria = (typeof CATEGORIE)[number]

export const PRIORITA = ['Bassa', 'Media', 'Alta', 'Critica'] as const
export type Priorita = (typeof PRIORITA)[number]

export const IMPATTI = ['Un utente', 'Gruppo / Servizio', 'Azienda'] as const
export type Impatto = (typeof IMPATTI)[number]

/**
 * Priorità **proposta** dall'app, mai decisa dal richiedente.
 *
 * Se la priorità la sceglie chi apre il ticket diventa Critica ogni volta, e
 * una coda dove tutto è critico non ha più priorità. Qui si chiedono due cose
 * che il richiedente sa davvero — quante persone tocca e se è bloccato — e il
 * livello lo si deriva. Chi prende in carico può sempre alzarlo o abbassarlo.
 */
export function prioritaProposta(impatto: Impatto, bloccante: boolean): Priorita {
  if (impatto === 'Azienda') return bloccante ? 'Critica' : 'Alta'
  if (impatto === 'Gruppo / Servizio') return bloccante ? 'Alta' : 'Media'
  return bloccante ? 'Media' : 'Bassa'
}

/**
 * Priorità che fanno saltare il digest e mandano la mail subito.
 *
 * Il digest giornaliero dice "c'è del lavoro"; questa dice "adesso". Se la
 * soglia scendesse a Media, il digest non servirebbe più a niente.
 */
export const PRIORITA_IMMEDIATE: Priorita[] = ['Critica']

/**
 * Giorni di apertura oltre i quali un ticket compare fra gli arretrati nel
 * digest. Non chiude niente e non solleva nessuno: lo rende visibile.
 */
export const GIORNI_ARRETRATO = 7

/**
 * Giorni dopo la risoluzione entro cui il richiedente può riaprire il ticket
 * con un clic da "Le mie richieste".
 *
 * Oltre questa finestra il problema che ritorna è un problema nuovo: tenere
 * riaperture a distanza di mesi sullo stesso ticket rende illeggibile sia lo
 * storico sia il conteggio degli interventi.
 */
export const GIORNI_RIAPERTURA = 15

// ============================================================
// Record
// ============================================================

export interface RichiestaAssistenza {
  spItemId: string
  codice: string // Title, es. "ASS-2026-001"

  // --- Richiesta (la compila chi chiede) ---
  richiedenteNome: string
  richiedenteLookupId: number
  dataApertura: string
  tipologia: string
  categoria: string
  /**
   * Il bene in Inventario, scelto da una tendina precompilata con quelli
   * assegnati alla mail di chi chiede. Assente quando il problema non riguarda
   * un dispositivo censito (la stampante di un'aula, la rete, un servizio).
   */
  bene?: { id: number; value: string }
  /** Testo libero quando il dispositivo non è in inventario o non si sa quale sia. */
  dispositivoAltro?: string
  problema: string
  /** Da quando succede: aiuta a legare il guasto a un aggiornamento o a un temporale. */
  daQuando?: string
  bloccante: boolean
  impatto: string
  /** Dove si trova chi chiede, per gli interventi che vanno fatti di persona. */
  struttura?: { id: number; value: string }
  recapito?: string
  disponibilita?: string
  allegatoUrl?: string
  allegatoNome?: string

  // --- Gestione (la compila l'IT) ---
  stato: StatoAssistenza
  priorita: string
  assegnatoNome?: string
  assegnatoLookupId?: number
  analisi?: string
  /** Cosa è stato fatto. Finisce anche nella mail di chiusura al richiedente. */
  interventi?: string
  assistenzaEsterna: boolean
  fornitoreEsterno?: string
  oreLavoro?: number
  noteInterne?: string
  motivoAnnullamento?: string
  dataChiusura?: string
  /**
   * Quante volte il richiedente ha detto "il problema è tornato". Un contatore
   * a 3 su un ticket è il segnale che il guasto non era quello che si pensava.
   */
  riaperture: number

  // --- Interni al flusso ---
  /**
   * Centro di costo del bene al momento del ticket, copiato dall'assegnazione
   * attiva. Fotografia, non lookup vivo: se domani il portatile passa a un
   * altro servizio, il costo di questo intervento resta dov'è maturato.
   */
  centroCosto?: { id: number; value: string }
  digestInviato: boolean
}

// ============================================================
// Payload API
// ============================================================

export interface NuovaRichiestaAssistenzaPayload {
  tipologia: string
  categoria: string
  /** Id SharePoint del bene in Inventario, 0 o assente se non è un bene censito. */
  beneId?: number
  dispositivoAltro?: string
  problema: string
  daQuando?: string
  bloccante: boolean
  impatto: string
  strutturaId?: number
  recapito?: string
  disponibilita?: string
  /** Allegato già caricato su SharePoint da lib/core/upload-diretto. */
  allegatoUrl?: string
  allegatoNome?: string
}

export type AzioneAssistenza =
  | 'prendi-in-carico'
  | 'assegna'
  | 'priorita'
  | 'lavora'
  | 'attesa-fornitore'
  | 'chiedi-info'
  | 'risolvi'
  | 'annulla'
  | 'note'
  | 'riapri'

export interface AggiornaAssistenzaPayload {
  azione: AzioneAssistenza
  // assegna
  assegnatoEmail?: string
  // priorita
  priorita?: Priorita
  // attesa-fornitore
  fornitoreEsterno?: string
  // chiedi-info → il testo va al richiedente per mail
  messaggio?: string
  // risolvi
  interventi?: string
  analisi?: string
  oreLavoro?: number
  assistenzaEsterna?: boolean
  // annulla
  motivo?: string
  // note
  noteInterne?: string
  // riapri (dal richiedente, da "Le mie richieste")
  perche?: string
}

// ============================================================
// Helper di presentazione
// ============================================================

export const STATO_STILE: Record<string, { badge: string; dot: string }> = {
  'Inviata':          { badge: 'bg-blue-50 text-blue-700 border-blue-200',       dot: 'bg-blue-500' },
  'Presa in carico':  { badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
  'In lavorazione':   { badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  'Attesa fornitore': { badge: 'bg-amber-50 text-amber-700 border-amber-200',    dot: 'bg-amber-500' },
  'Attesa utente':    { badge: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  'Risolta':          { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  'Annullata':        { badge: 'bg-gray-100 text-gray-500 border-gray-200',      dot: 'bg-gray-300' },
}

export const PRIORITA_STILE: Record<string, string> = {
  'Bassa':   'bg-gray-100 text-gray-600',
  'Media':   'bg-blue-100 text-blue-700',
  'Alta':    'bg-orange-100 text-orange-700',
  'Critica': 'bg-red-100 text-red-700 font-bold',
}

/** Colore per le mail: niente classi Tailwind, lì servono esadecimali. */
export const PRIORITA_COLORE: Record<string, string> = {
  'Bassa':   '#1F4E79',
  'Media':   '#1F4E79',
  'Alta':    '#E36C09',
  'Critica': '#C00000',
}

export const dataBreve = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('it-IT')
}

/** Giorni trascorsi da una data ISO: 0 se è oggi, negativo se è nel futuro. */
export function giorniDa(iso?: string | null): number | undefined {
  if (!iso) return undefined
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z')
  if (isNaN(d.getTime())) return undefined
  const oggi = new Date()
  const oggiUtc = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate(), 12)
  return Math.round((oggiUtc - d.getTime()) / 86_400_000)
}

/** true se il ticket è aperto da più di GIORNI_ARRETRATO giorni. */
export function arretrato(r: RichiestaAssistenza): boolean {
  if (!STATI_APERTI.includes(r.stato)) return false
  const g = giorniDa(r.dataApertura)
  return g !== undefined && g > GIORNI_ARRETRATO
}

/** true se il richiedente può ancora riaprire il ticket con un clic. */
export function riapribile(r: RichiestaAssistenza): boolean {
  if (r.stato !== 'Risolta') return false
  const g = giorniDa(r.dataChiusura || r.dataApertura)
  return g !== undefined && g <= GIORNI_RIAPERTURA
}

/**
 * Come si chiama il dispositivo nel ticket: il codice di inventario se c'è,
 * altrimenti quello che ha scritto il richiedente.
 */
export function dispositivoDi(r: RichiestaAssistenza): string {
  return r.bene?.value || r.dispositivoAltro || ''
}
