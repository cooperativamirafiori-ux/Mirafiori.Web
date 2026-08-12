/**
 * Richiesta di fattura — tipi e regole di compilazione.
 *
 * Questo file è la **fonte di verità unica** su quali campi servono per ogni
 * tipologia di soggetto: lo leggono sia il form (per decidere cosa mostrare)
 * sia l'API (per validare). Se domani l'ufficio cambia idea su un campo
 * obbligatorio, si tocca solo qui e le due parti restano d'accordo.
 *
 * Nessun import: deve poter essere usato tanto dal client quanto dal server.
 */

// ============================================================
// Vocabolari
// ============================================================

export const TIPI_SOGGETTO = [
  'Privato',
  'Persona fisica titolare di Partita IVA',
  'Soggetto diverso da persona fisica',
] as const

export type TipoSoggetto = (typeof TIPI_SOGGETTO)[number]

export const NAZIONALITA = ['Italiana', 'Estera'] as const
export type Nazionalita = (typeof NAZIONALITA)[number]

/** Prefisso e cifre del numero di richiesta: RF-0001. Progressivo continuo, non annuale. */
export const PREFISSO_FATTURA = 'RF'
const CIFRE_FATTURA = 4

export function formattaNumeroFattura(progressivo: number): string {
  return `${PREFISSO_FATTURA}-${String(progressivo).padStart(CIFRE_FATTURA, '0')}`
}

export function progressivoDaNumeroFattura(numero?: string | null): number | null {
  const m = String(numero ?? '').match(new RegExp(`^${PREFISSO_FATTURA}-(\\d+)$`))
  return m ? Number(m[1]) : null
}

// ============================================================
// Campi anagrafici che dipendono dalla tipologia
// ============================================================

/** I campi del soggetto che cambiano da una tipologia all'altra. */
export type CampoSoggetto =
  | 'cognome'
  | 'nome'
  | 'ragioneSociale'
  | 'partitaIva'
  | 'codiceFiscale'

export const ETICHETTE_SOGGETTO: Record<CampoSoggetto, string> = {
  cognome: 'Cognome',
  nome: 'Nome',
  ragioneSociale: 'Ragione sociale',
  partitaIva: 'Partita IVA',
  codiceFiscale: 'Codice fiscale',
}

/**
 * Quali campi chiedere per ciascuna tipologia. Elenco *ordinato*: il form li
 * stampa in quest'ordine, quindi l'ordine qui è anche l'ordine a video.
 */
export const CAMPI_PER_TIPO: Record<TipoSoggetto, readonly CampoSoggetto[]> = {
  'Privato': ['cognome', 'nome', 'codiceFiscale'],
  'Persona fisica titolare di Partita IVA': [
    'cognome',
    'nome',
    'ragioneSociale',
    'partitaIva',
    'codiceFiscale',
  ],
  'Soggetto diverso da persona fisica': ['ragioneSociale', 'partitaIva', 'codiceFiscale'],
}

/** La spunta "è un condominio" ha senso solo per gli enti. */
export function chiedeCondominio(tipo: TipoSoggetto): boolean {
  return tipo === 'Soggetto diverso da persona fisica'
}

// ============================================================
// Forma dei dati
// ============================================================

/** Quello che il form manda all'API. Tutti stringhe: arriva da input HTML. */
export interface NuovaRichiestaFatturaInput {
  centroCosto: string

  tipoSoggetto: TipoSoggetto | ''
  nazionalita: Nazionalita | ''
  condominio: boolean

  cognome: string
  nome: string
  ragioneSociale: string
  partitaIva: string
  codiceFiscale: string

  indirizzo: string
  cap: string
  citta: string
  provincia: string
  nazione: string

  telefono: string
  email: string
  pec: string

  descrizione: string
  importo: string
  dataPrestazione: string

  note: string
}

/** Una richiesta già salvata su SharePoint. */
export interface RichiestaFattura
  extends Omit<NuovaRichiestaFatturaInput, 'importo' | 'tipoSoggetto' | 'nazionalita'> {
  spItemId: string
  numero: string
  importo: number
  tipoSoggetto: TipoSoggetto
  nazionalita: Nazionalita
  richiedente: string
  richiedenteNome: string
  creato?: string
}

export function richiestaVuota(): NuovaRichiestaFatturaInput {
  return {
    centroCosto: '',
    tipoSoggetto: '',
    nazionalita: 'Italiana',
    condominio: false,
    cognome: '',
    nome: '',
    ragioneSociale: '',
    partitaIva: '',
    codiceFiscale: '',
    indirizzo: '',
    cap: '',
    citta: '',
    provincia: '',
    nazione: 'Italia',
    telefono: '',
    email: '',
    pec: '',
    descrizione: '',
    importo: '',
    dataPrestazione: new Date().toISOString().slice(0, 10),
    note: '',
  }
}

/** Come si chiama il cliente in una riga sola: serve nel titolo della mail. */
export function intestatario(r: {
  ragioneSociale?: string
  cognome?: string
  nome?: string
}): string {
  const persona = [r.cognome, r.nome].filter(Boolean).join(' ').trim()
  return (r.ragioneSociale || '').trim() || persona || '(senza nome)'
}

// ============================================================
// Validazione — la stessa per form e API
// ============================================================

/**
 * Errori campo per campo. Chiave = nome del campo, valore = messaggio.
 * Oggetto vuoto = tutto a posto.
 *
 * Cosa è obbligatorio e perché:
 *  - i campi della tipologia (§ CAMPI_PER_TIPO): li ha indicati l'ufficio;
 *  - centro di costo: senza, la fattura non si sa a chi imputarla;
 *  - indirizzo, città e nazione: servono in fattura. CAP e provincia solo per
 *    l'Italia, perché all'estero spesso non esistono nella stessa forma;
 *  - email: è il recapito con cui si manda la fattura. Telefono e PEC restano
 *    facoltativi (un privato la PEC quasi mai ce l'ha);
 *  - descrizione, importo e data: sono ciò che Andrea deve fatturare.
 *
 * I formati di codice fiscale e partita IVA si controllano **solo** per i
 * soggetti italiani: quelli esteri hanno codifiche diverse e un controllo
 * sbagliato bloccherebbe una richiesta legittima.
 */
export function validaRichiesta(r: NuovaRichiestaFatturaInput): Record<string, string> {
  const e: Record<string, string> = {}
  const vuoto = (v: string) => !String(v ?? '').trim()

  if (vuoto(r.centroCosto)) e.centroCosto = 'Indica il centro di costo'
  if (!r.tipoSoggetto) e.tipoSoggetto = 'Scegli la tipologia di soggetto'
  if (!r.nazionalita) e.nazionalita = 'Indica la nazionalità'

  if (r.tipoSoggetto) {
    for (const campo of CAMPI_PER_TIPO[r.tipoSoggetto]) {
      if (vuoto(r[campo])) e[campo] = `${ETICHETTE_SOGGETTO[campo]} obbligatorio`
    }
  }

  const italiano = r.nazionalita === 'Italiana'
  if (italiano) {
    const cf = r.codiceFiscale.replace(/\s/g, '').toUpperCase()
    // 16 caratteri per le persone fisiche, 11 cifre per gli enti (che spesso
    // hanno CF uguale alla partita IVA).
    if (cf && !/^[A-Z0-9]{16}$/.test(cf) && !/^\d{11}$/.test(cf)) {
      e.codiceFiscale = 'Il codice fiscale italiano ha 16 caratteri (11 cifre per gli enti)'
    }
    const piva = r.partitaIva.replace(/\s/g, '')
    if (piva && !/^\d{11}$/.test(piva)) {
      e.partitaIva = 'La partita IVA italiana ha 11 cifre'
    }
  }

  if (vuoto(r.indirizzo)) e.indirizzo = 'Indica via e numero civico'
  if (vuoto(r.citta)) e.citta = 'Indica la città'
  if (vuoto(r.nazione)) e.nazione = 'Indica la nazione'
  if (italiano) {
    if (vuoto(r.cap)) e.cap = 'Indica il CAP'
    else if (!/^\d{5}$/.test(r.cap.trim())) e.cap = 'Il CAP italiano ha 5 cifre'
    if (vuoto(r.provincia)) e.provincia = 'Indica la provincia'
  }

  if (vuoto(r.email)) e.email = 'Serve un indirizzo email per mandare la fattura'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) e.email = 'Email non valida'
  if (!vuoto(r.pec) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.pec.trim())) e.pec = 'PEC non valida'

  if (vuoto(r.descrizione)) e.descrizione = 'Descrivi cosa va fatturato'
  if (vuoto(r.dataPrestazione)) e.dataPrestazione = 'Indica la data della prestazione'

  const importo = Number(String(r.importo).replace(',', '.'))
  if (vuoto(r.importo)) e.importo = "Indica l'importo"
  else if (!Number.isFinite(importo) || importo <= 0) e.importo = 'Importo non valido'

  return e
}
