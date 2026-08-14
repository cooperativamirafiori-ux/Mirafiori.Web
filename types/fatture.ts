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

/**
 * Cosa si chiede di emettere. Le note servono a rettificare una fattura già
 * fatta, quindi pretendono il riferimento a quella fattura.
 */
export const TIPI_DOCUMENTO = ['Fattura', 'Nota di credito', 'Nota di debito'] as const
export type TipoDocumento = (typeof TIPI_DOCUMENTO)[number]

export const MEZZI_PAGAMENTO = [
  'Contanti',
  'Bancomat o carta',
  'Bonifico',
  'Assegno',
  'Altro',
] as const

export const NATURE_IMPORTO = ['Totale (IVA compresa)', 'Imponibile (IVA esclusa)'] as const
export type NaturaImporto = (typeof NATURE_IMPORTO)[number]

/** Valore speciale: operazione fuori campo IVA, serve l'articolo di esclusione. */
export const FUORI_CAMPO = 'FUORI_CAMPO'
/** Valore speciale: chi compila non sa che aliquota si applica. La decide chi fattura. */
export const NON_SO = 'NON_SO'

/** Le scelte del menu aliquota, quando il modulo la chiede. */
export const ALIQUOTE: ReadonlyArray<{ valore: string; etichetta: string }> = [
  { valore: '4', etichetta: '4%' },
  { valore: '5', etichetta: '5% — servizi educativi e sociali' },
  { valore: '10', etichetta: '10% — ristorazione e ricettività' },
  { valore: '22', etichetta: '22% — aliquota ordinaria' },
  { valore: FUORI_CAMPO, etichetta: 'Fuori campo IVA / esente' },
  { valore: NON_SO, etichetta: 'Non lo so — decidete voi' },
]

export const ETICHETTE_ALIQUOTA: Record<string, string> = Object.fromEntries(
  ALIQUOTE.map((a) => [a.valore, a.etichetta]),
)

/** Oggi in formato YYYY-MM-DD, ora locale (non UTC: sposterebbe il giorno). */
export function oggi(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

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

  /**
   * Riga dell'anagrafica Clienti da cui sono stati presi i dati, se chi compila
   * ha scelto un cliente già in memoria. Vuoto = cliente nuovo, o compilato a
   * mano senza passare dalla ricerca: in quel caso l'API prova comunque a
   * riconoscerlo da partita IVA/codice fiscale prima di crearne uno nuovo.
   */
  clienteId: string

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
  /** Codice destinatario della fattura elettronica: 7 caratteri, facoltativo. */
  codiceSdi: string

  descrizione: string
  importo: string
  dataPrestazione: string

  /** Fattura, o nota di credito/debito. Per i centri di costo noti è sempre "Fattura". */
  tipoDocumento: TipoDocumento
  /** Numero della fattura da rettificare: obbligatorio per le note. */
  riferimentoDocumento: string

  /**
   * Cosa rappresenta `importo` — lo si chiede solo quando il centro di costo
   * non ha un regime configurato. Vedi § Regime IVA.
   */
  naturaImporto: NaturaImporto | ''
  /** Aliquota dichiarata: "5" "10" "22", FUORI_CAMPO o NON_SO. Vuoto se la decide il regime. */
  aliquota: string
  /** Articolo che esclude l'operazione dall'IVA: obbligatorio con FUORI_CAMPO. */
  articoloEsclusione: string

  incassato: boolean
  mezzoPagamento: string
  dataIncasso: string

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
    clienteId: '',
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
    // Codice ISO, non il nome del paese: è la forma dell'anagrafica Clienti.
    nazione: 'IT',
    telefono: '',
    email: '',
    pec: '',
    codiceSdi: '',
    descrizione: '',
    importo: '',
    dataPrestazione: oggi(),
    tipoDocumento: 'Fattura',
    riferimentoDocumento: '',
    naturaImporto: '',
    aliquota: '',
    articoloEsclusione: '',
    incassato: false,
    mezzoPagamento: '',
    dataIncasso: '',
    note: '',
  }
}

// ============================================================
// Regime IVA — dipende dal servizio, non da chi compila
// ============================================================

/**
 * **Perché l'IVA non si chiede a chi compila.** L'aliquota dipende dal tipo di
 * prestazione (ristorazione 10%, servizi educativi 5%, ordinaria 22%), e chi sta
 * alla cassa non ha motivo di saperlo: chiedendoglielo si ottengono risposte a
 * caso. Ma la prestazione il modulo la conosce già — è il centro di costo.
 *
 * Quindi il regime si configura **una volta per centro di costo** e chi compila
 * non scegli nulla: legge solo l'etichetta giusta sul campo dell'importo, e chi
 * fattura riceve imponibile e IVA già scorporati.
 *
 * Per i centri di costo non ancora configurati il modulo ripiega sulle domande
 * esplicite, con l'opzione «non lo so» che segnala il caso invece di far
 * indovinare. È un ripiego, non la regola: ogni centro di costo che passa da qui
 * più di una volta va aggiunto alla configurazione.
 *
 * **Dove finirà questa tabella.** Sulla lista SharePoint dei Centri di Costo,
 * come due colonne (aliquota e natura dell'importo), appena la lista sarà
 * approvata. Qui resta perché quella lista ancora non esiste e il centro di
 * costo è un campo di testo libero.
 */
export interface Regime {
  /** Aliquota in percentuale. null = da determinare o fuori campo. */
  aliquota: number | null
  /** true se l'importo che si scrive comprende già l'IVA. */
  lordo: boolean
  /** true se il modulo deve chiedere aliquota e natura dell'importo. */
  daChiedere: boolean
}

const REGIMI_NOTI: Record<string, { aliquota: number; lordo: boolean }> = {
  // La Locanda incassa alla cassa: quello che si scrive è il totale pagato.
  locanda: { aliquota: 10, lordo: true },
}

/** Confronto tollerante: minuscole, senza accenti, spazi normalizzati. */
function normalizza(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function regimeDi(centroCosto: string): Regime {
  const noto = REGIMI_NOTI[normalizza(centroCosto)]
  if (noto) return { ...noto, daChiedere: false }
  return { aliquota: null, lordo: true, daChiedere: true }
}

/** Etichetta del campo importo: è lei a dire cosa scrivere, non una nota a parte. */
export function etichettaImporto(regime: Regime): string {
  if (regime.daChiedere) return 'Importo (€)'
  return regime.lordo
    ? `Totale pagato dal cliente (€, IVA ${regime.aliquota}% compresa)`
    : `Importo imponibile (€, IVA ${regime.aliquota}% esclusa)`
}

/**
 * Imponibile, IVA e totale a partire da quello che è stato scritto.
 * null quando l'aliquota non è determinata: non si inventa un calcolo.
 */
export function scorpora(
  importo: number,
  aliquota: number | null,
  lordo: boolean,
): { imponibile: number; iva: number; totale: number } | null {
  if (aliquota == null || !Number.isFinite(importo)) return null
  const arrotonda = (n: number) => Math.round(n * 100) / 100
  if (lordo) {
    const imponibile = arrotonda(importo / (1 + aliquota / 100))
    return { imponibile, iva: arrotonda(importo - imponibile), totale: arrotonda(importo) }
  }
  const iva = arrotonda((importo * aliquota) / 100)
  return { imponibile: arrotonda(importo), iva, totale: arrotonda(importo + iva) }
}

/**
 * Il conto dell'IVA per una richiesta, in un posto solo.
 *
 * La usano tutti e tre: il modulo per l'anteprima mentre si compila, `data.ts`
 * per le colonne Imponibile e Iva, la mail per quello che legge chi fattura.
 * Se il calcolo stesse in tre posti, un giorno darebbero tre numeri diversi.
 */
export function calcoloIva(r: {
  centroCosto: string
  importo: string | number
  naturaImporto?: string
  aliquota?: string
  articoloEsclusione?: string
}): {
  aliquota: number | null
  lordo: boolean
  /** Come si dice a voce, per la mail e per l'anteprima. */
  descrizione: string
  scorporo: { imponibile: number; iva: number; totale: number } | null
} {
  const importo = Number(String(r.importo ?? '').replace(',', '.'))
  const regime = regimeDi(r.centroCosto)

  // Centro di costo configurato: decide lui, e chi compila non ha scelto niente.
  if (!regime.daChiedere) {
    return {
      aliquota: regime.aliquota,
      lordo: regime.lordo,
      descrizione: `${regime.aliquota}% — regime del centro di costo ${r.centroCosto}`,
      scorporo: scorpora(importo, regime.aliquota, regime.lordo),
    }
  }

  const lordo = r.naturaImporto !== 'Imponibile (IVA esclusa)'
  const dichiarata = (r.aliquota ?? '').trim()

  if (dichiarata === FUORI_CAMPO) {
    const art = (r.articoloEsclusione ?? '').trim()
    return {
      aliquota: null,
      lordo,
      descrizione: `fuori campo IVA${art ? ` — ${art}` : ''}`,
      scorporo: null,
    }
  }
  if (!dichiarata || dichiarata === NON_SO) {
    return {
      aliquota: null,
      lordo,
      descrizione: 'da determinare — chi ha fatto la richiesta non la conosce',
      scorporo: null,
    }
  }

  const n = Number(dichiarata)
  const aliquota = Number.isFinite(n) ? n : null
  return {
    aliquota,
    lordo,
    descrizione: aliquota == null ? 'da determinare' : `${aliquota}% — dichiarata nella richiesta`,
    scorporo: scorpora(importo, aliquota, lordo),
  }
}

// ============================================================
// Tempi di invio
// ============================================================

/** Entro quanti giorni dalla prestazione va mandata la richiesta. */
export const GIORNI_INVIO = 5
/** Entro quanti giorni dalla prestazione va emessa la fattura. */
export const GIORNI_EMISSIONE = 10

/**
 * Giorni passati dalla prestazione. Negativo se la data è nel futuro (acconti).
 *
 * Si confrontano date sole, a mezzogiorno, così l'ora legale non sposta il conto
 * di un giorno.
 */
export function giorniDaPrestazione(dataPrestazione: string, riferimento = oggi()): number | null {
  const solo = (s: string) => String(s ?? '').slice(0, 10)
  const a = solo(dataPrestazione)
  const b = solo(riferimento)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null
  const ms = new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()
  return Math.round(ms / 86_400_000)
}

export type Puntualita = 'in tempo' | 'in ritardo' | 'oltre il termine' | 'futura'

/**
 * Quanto siamo in ritardo. Non blocca niente: una fattura tardiva va comunque
 * emessa, e impedire l'invio sposterebbe solo il problema fuori dall'app.
 */
export function puntualita(dataPrestazione: string, riferimento = oggi()): {
  stato: Puntualita
  giorni: number
} {
  const giorni = giorniDaPrestazione(dataPrestazione, riferimento)
  if (giorni == null) return { stato: 'in tempo', giorni: 0 }
  if (giorni < 0) return { stato: 'futura', giorni }
  if (giorni > GIORNI_EMISSIONE) return { stato: 'oltre il termine', giorni }
  if (giorni > GIORNI_INVIO) return { stato: 'in ritardo', giorni }
  return { stato: 'in tempo', giorni }
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

/**
 * Svuota i campi che, per come è compilato il resto, non vengono più chiesti.
 *
 * Serve perché un campo che scompare dallo schermo **non si svuota da sé**: chi
 * compila la richiesta per un servizio qualsiasi dichiarando IVA 22%, e poi
 * cambia il centro di costo in Locanda, non vede più quel campo ma il 22
 * resterebbe nei dati inviati. Non produrrebbe una fattura sbagliata — il conto
 * lo rifà `calcoloIva` dal regime — ma lascerebbe nella lista una richiesta che
 * dice 22 mentre la mail dice 10, e fra sei mesi nessuno saprebbe quale credere.
 *
 * La chiamano **entrambi**: il modulo prima di inviare e l'API prima di
 * validare. Lato server è la garanzia vera, perché un browser con la pagina
 * aperta da ieri può mandare qualsiasi cosa.
 */
export function pulisciCampiNascosti(
  r: NuovaRichiestaFatturaInput,
): NuovaRichiestaFatturaInput {
  const p = { ...r }

  // Regime configurato: l'IVA la decide lui, e non si emettono note.
  if (!regimeDi(p.centroCosto).daChiedere) {
    p.naturaImporto = ''
    p.aliquota = ''
    p.tipoDocumento = 'Fattura'
  }
  if (p.tipoDocumento === 'Fattura') p.riferimentoDocumento = ''
  if (p.aliquota !== FUORI_CAMPO) p.articoloEsclusione = ''
  if (!p.incassato) {
    p.mezzoPagamento = ''
    p.dataIncasso = ''
  }

  // Campi anagrafici che la tipologia scelta non prevede. Senza questo, chi
  // passa da "persona fisica con partita IVA" a "privato" si porterebbe dietro
  // una ragione sociale, e `intestatario()` intesterebbe la fattura a quella.
  if (p.tipoSoggetto) {
    const previsti = new Set<string>(CAMPI_PER_TIPO[p.tipoSoggetto])
    for (const campo of ['cognome', 'nome', 'ragioneSociale', 'partitaIva', 'codiceFiscale'] as const) {
      if (!previsti.has(campo)) p[campo] = ''
    }
  }
  if (!p.tipoSoggetto || !chiedeCondominio(p.tipoSoggetto)) p.condominio = false

  return p
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
  // Nazione e nazionalità sono due campi distinti perché l'ufficio vuole la
  // dichiarazione esplicita, ma non possono contraddirsi: un cliente in Italia
  // con nazionalità Estera è un errore di compilazione, non un caso di frontiera.
  else if (italiano !== (r.nazione.trim().toUpperCase() === 'IT')) {
    e.nazionalita = italiano
      ? 'Hai indicato nazionalità Italiana ma una nazione estera'
      : 'Hai indicato nazionalità Estera ma la nazione è Italia'
  }
  if (italiano) {
    if (vuoto(r.cap)) e.cap = 'Indica il CAP'
    else if (!/^\d{5}$/.test(r.cap.trim())) e.cap = 'Il CAP italiano ha 5 cifre'
    if (vuoto(r.provincia)) e.provincia = 'Indica la provincia'
  }

  if (vuoto(r.email)) e.email = 'Serve un indirizzo email per mandare la fattura'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) e.email = 'Email non valida'
  if (!vuoto(r.pec) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.pec.trim())) e.pec = 'PEC non valida'
  // Il codice destinatario è facoltativo, ma se c'è deve avere la sua forma:
  // 7 caratteri per i privati, 6 per la pubblica amministrazione.
  const sdi = r.codiceSdi.replace(/\s/g, '').toUpperCase()
  if (sdi && !/^[A-Z0-9]{6,7}$/.test(sdi)) {
    e.codiceSdi = 'Il codice destinatario ha 7 caratteri (6 per la PA)'
  }

  if (vuoto(r.descrizione)) e.descrizione = 'Descrivi cosa va fatturato'
  if (vuoto(r.dataPrestazione)) e.dataPrestazione = 'Indica la data della prestazione'

  const importo = Number(String(r.importo).replace(',', '.'))
  if (vuoto(r.importo)) e.importo = "Indica l'importo"
  else if (!Number.isFinite(importo) || importo <= 0) e.importo = 'Importo non valido'

  // Una nota rettifica un documento già emesso: senza il riferimento non si sa
  // quale, e chi fattura dovrebbe rincorrere chi ha fatto la richiesta.
  if (r.tipoDocumento !== 'Fattura' && vuoto(r.riferimentoDocumento)) {
    e.riferimentoDocumento = 'Indica numero e data della fattura da rettificare'
  }

  // IVA: si chiede solo dove il centro di costo non ha un regime configurato.
  // "Non lo so" è una risposta ammessa di proposito — vedi § Regime IVA.
  if (regimeDi(r.centroCosto).daChiedere) {
    if (!r.naturaImporto) e.naturaImporto = "Indica se l'importo è il totale o l'imponibile"
    if (vuoto(r.aliquota)) e.aliquota = "Indica l'IVA, o scegli «non lo so»"
    if (r.aliquota === FUORI_CAMPO && vuoto(r.articoloEsclusione)) {
      e.articoloEsclusione = "Indica l'articolo che esclude l'operazione dall'IVA"
    }
  }

  if (r.incassato) {
    if (vuoto(r.mezzoPagamento)) e.mezzoPagamento = 'Indica come è stato pagato'
    if (vuoto(r.dataIncasso)) e.dataIncasso = "Indica la data dell'incasso"
  }

  return e
}
