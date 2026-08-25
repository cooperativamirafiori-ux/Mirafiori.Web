/**
 * Tipi della sezione Timbrature (dati su Supabase/Postgres).
 * Vedi web/supabase/timbrature_schema.sql per lo schema.
 */

export type TipoVoce = 'lavoro' | 'giustificativo'

/**
 * Percorso del mese, dalla compilazione all'archiviazione.
 *
 *   aperto      il dipendente compila (finestra mobile di 3 giorni)
 *   da_validare finestra scaduta: la palla passa al responsabile diretto
 *   validato    il responsabile ha approvato; il dipendente ha ricevuto il PDF
 *   confermato  il dipendente ha dato l'ok (o il responsabile ha forzato):
 *               il foglio e' definitivo e archiviato nella cartella personale
 *   contestato  il dipendente ha segnalato un errore: torna al responsabile
 */
export type StatoMese = 'aperto' | 'da_validare' | 'validato' | 'confermato' | 'contestato'

export const ETICHETTA_STATO: Record<StatoMese, string> = {
  aperto: 'In compilazione',
  da_validare: 'Da validare',
  validato: 'Attesa conferma',
  confermato: 'Confermato',
  contestato: 'Contestato',
}

export interface Servizio {
  id: number
  nome: string
  /**
   * Vecchio macro-raggruppamento del foglio ore Excel (1=Interni, 2=Sanitari,
   * 3=Cultura, 4=Educativi/sociali, 5=Altri, 99=Giustificativi). **Non** è un
   * centro di costo: quello vero è `centroCostoCodice`. Resta finché non si
   * rinomina la colonna su Supabase.
   */
  macroGruppo: number
  /** cc1…cc23 — aggancio alla lista Centri di Costo di SharePoint. */
  centroCostoCodice: string | null
  /** Etichetta del centro di costo, copiata per il foglio ore. */
  centroCostoNome: string | null
  categoria: string | null
  tipoVoce: TipoVoce
  attivo: boolean
  ordine: number
  /** Solo per i giustificativi: puo' essere preso anche per una fascia oraria
   *  (dalle-alle), non solo a giornata intera. Es. Ferie, Permessi retribuiti. */
  adOre: boolean
  /**
   * Su questo servizio si puo' indicare anche il progetto (vedi `Progetto`).
   * Oggi solo Progettazione, ma e' una spunta sul servizio e non un elenco nel
   * codice: domani ne bastera' una UPDATE per aggiungerne un altro.
   */
  chiedeProgetto: boolean
}

/**
 * Il progetto su cui sono state fatte le ore: seconda dimensione della riga,
 * indipendente dal servizio.
 *
 * Il servizio dice che lavoro e' (e porta il centro di costo, uno solo per
 * tutta la progettazione); il progetto dice per quale bando o commessa, ed e'
 * l'unico modo per rendicontare le ore progetto per progetto. Sempre
 * FACOLTATIVO: la progettazione non imputabile a un singolo progetto esiste, e
 * una riga senza progetto e' un dato legittimo.
 */
export interface Progetto {
  id: number
  nome: string
  attivo: boolean
  ordine: number
}

export interface Dipendente {
  id: number
  email: string
  cognomeNome: string
  referenteEmail: string | null
  attivo: boolean
}

/**
 * Una variazione di orario: il monte ore settimanale valido da una certa data.
 *
 * Non e' "l'orario del dipendente" ma una riga di storico: il monte ore vigente
 * a una data e' la variazione piu' recente con decorrenza <= quella data. E'
 * questo numero a determinare le ore attese di ogni giornata, quindi la
 * completezza, i solleciti, lo scostamento e la flessibilita': per questo porta
 * con se' il motivo e la lettera firmata.
 */
export interface ProfiloOrario {
  id: number
  dipendenteId: number
  decorrenza: string // YYYY-MM-DD
  oreLun: number
  oreMar: number
  oreMer: number
  oreGio: number
  oreVen: number
  oreSab: number
  oreDom: number
  aggiornatoDa: string | null
  aggiornatoIl: string
  /** Perche' l'orario e' cambiato, in chiaro. */
  motivo: string | null
  /** Lettera di variazione firmata, nella cartella personale del dipendente. */
  fileUrl: string | null
  fileNome: string | null
}

/** Variazione di orario in arrivo da una route, gia' normalizzata. */
export interface VariazioneOrarioInput {
  dipendenteId: number
  decorrenza: string
  ore: MonteOreSettimana
  motivo: string | null
  file: { url: string; nome: string } | null
}

/** Ore attese indicizzate 1..7 (lun..dom), per allineamento con WEEKDAY(x,2) di Excel */
export type MonteOreSettimana = Record<1 | 2 | 3 | 4 | 5 | 6 | 7, number>

export interface Timbratura {
  id: string
  dipendenteId: number
  data: string // YYYY-MM-DD
  servizioId: number
  tipoVoce: TipoVoce
  oraInizio: string | null // HH:mm
  oraFine: string | null // HH:mm
  ore: number
  /**
   * Turno notturno, dichiarato a mano. Mai calcolato dagli orari: la
   * maggiorazione e' forfettaria a notte, quindi conta la dichiarazione e non la
   * fascia. Solo sulle righe di lavoro.
   */
  notte: boolean
  /** Il turno era in reperibilita'. Non incide su nessun conteggio: serve alle HR per il costo. */
  reperibilita: boolean
  mutua: boolean
  note: string | null
  creataDa: string | null
  modificataDa: string | null
  modificataIl: string | null
  /** Riga scritta da qualcun altro (responsabile o HR) per conto del dipendente. */
  perConto: boolean
  /** Progetto a cui vanno le ore. Solo sui servizi con `chiedeProgetto`, e mai obbligatorio. */
  progettoId: number | null
  // arricchimenti (join con servizio e progetto)
  servizioNome?: string
  centroCostoCodice?: string | null
  centroCostoNome?: string | null
  progettoNome?: string | null
}

export interface TimbraturaInput {
  data: string
  servizioId: number
  /** Ingresso e uscita (HH:mm). OBBLIGATORI per le voci di lavoro: le ore sono
   *  sempre calcolate da questi due valori, al minuto esatto. Devono restare
   *  vuoti per i giustificativi, che occupano il monte ore atteso del giorno.
   *  Un intervallo che scavalca la mezzanotte (20:00 → 08:00) e' ammesso: viene
   *  spezzato in due righe, una per giornata. */
  oraInizio?: string | null
  oraFine?: string | null
  /** Facoltativo, e tenuto solo se il servizio scelto chiede il progetto. */
  progettoId?: number | null
  notte?: boolean
  reperibilita?: boolean
  mutua?: boolean
  note?: string | null
}

/**
 * Esito di una scrittura. Le righe sono piu' di una quando il turno scavalca la
 * mezzanotte; `avviso` e' il messaggio da mostrare a chi ha salvato, perche'
 * ritrovarsi righe su un giorno che non si e' digitato va spiegato.
 */
export interface EsitoScrittura {
  righe: Timbratura[]
  avviso?: string
}

/**
 * Esito dell'inserimento (o della rimozione) di un'assenza su un periodo.
 * Ogni giornata finisce in uno dei quattro elenchi: a fine operazione si dice
 * esattamente com'e' andata, senza silenzi.
 */
export interface EsitoAssenzaPeriodo {
  inserite: string[]
  rimosse?: string[]
  /** Domeniche, festivi e giorni a monte ore zero: una riga da zero ore non serve. */
  nonLavorativi: string[]
  /** Giorni che avevano gia' qualcosa scritto: non si sovrascrive nulla. */
  giaCompilati: string[]
  errori: { data: string; motivo: string }[]
}

export interface ChiusuraMese {
  id: number
  dipendenteId: number
  anno: number
  mese: number
  stato: StatoMese
  chiusoDa: string | null
  chiusoIl: string | null
  /** Foglio ore in formato Excel nella cartella personale. */
  fileUrl: string | null
  /** Foglio ore in PDF: e' la copia che il dipendente riceve e conferma. */
  filePdfUrl: string | null
  /**
   * Copia PDF nella cartella HR del mese (Fogli Ore/<anno>/<mese>/).
   * Valorizzata solo sui fogli definitivi: in quella cartella non ci vanno bozze.
   */
  fileHrUrl: string | null
  validatoDa: string | null
  validatoIl: string | null
  confermatoDa: string | null
  confermatoIl: string | null
  /** Conferma messa dal responsabile al posto del dipendente che non risponde. */
  confermatoForzato: boolean
  contestatoIl: string | null
  noteContestazione: string | null
  /** Token del link nella mail di conferma (non esposto al client). */
  token?: string | null
  ultimoSollecito: string | null
}

/**
 * Cosa puo' fare il dipendente su un mese, e perche'.
 * Le ore di lavoro si inseriscono solo negli ultimi giorni; i giustificativi
 * (ferie, permessi, malattia) seguono il solo stato del mese, cosi' si possono
 * programmare in anticipo e registrare quando il certificato arriva.
 */
export interface FinestraMese {
  stato: StatoMese
  /** Il mese accetta ancora scritture dal dipendente. */
  aperta: boolean
  motivo?: string
  /** Prima data per cui si possono ancora inserire ORE DI LAVORO. */
  daGiorno: string
  /** Ultimo giorno in cui il mese resta aperto al dipendente. */
  ultimoGiorno: string
}

/** Riga del cruscotto giornaliero: totali del giorno vs monte ore atteso */
export interface RiepilogoGiorno {
  data: string
  oreLavorate: number // solo tipo_voce = lavoro
  oreGiustificativo: number
  oreAttese: number // 0 se festivo
  festivo: boolean
  festivitaNome?: string
  completo: boolean // oreLavorate+oreGiustificativo >= oreAttese
  /**
   * Le voci di assenza che coprono la giornata (Ferie, Legge 104, …), per
   * mostrare il tag sul giorno nella vista mese senza doverlo aprire.
   */
  voci: string[]
  /** Almeno una riga di lavoro del giorno e' dichiarata notturna. */
  notte: boolean
  /** Almeno una riga di lavoro del giorno e' dichiarata in reperibilita'. */
  reperibilita: boolean
}

/** Riga di scostamento su una singola settimana (ISO lun–dom, ritagliata al periodo) */
export interface RiepilogoSettimana {
  inizio: string // YYYY-MM-DD (primo giorno della settimana compreso nel periodo)
  fine: string // YYYY-MM-DD (ultimo giorno della settimana compreso nel periodo)
  oreLavorate: number
  oreGiustificativo: number
  oreAttese: number
  scostamento: number // (lavorate+giustificativo) - attese
  conclusa: boolean // true se la settimana è terminata (fine < oggi): scostamento definitivo
}

/**
 * Ore consumate su una singola voce di giustificativo nel periodo.
 * Serve a mostrare Ferie / Flessibilità / Permessi ecc. spaccati, non solo il
 * totale: è il dato che interessa a chi compila e a chi controlla.
 */
export interface OrePerVoce {
  servizioId: number
  nome: string
  ore: number
}

/** Cruscotto settimanale/mensile dell'operatore */
export interface RiepilogoPeriodo {
  oreLavorate: number
  oreGiustificativo: number
  oreAttese: number
  scostamento: number // (lavorate+giustificativo) - attese
  giorni: RiepilogoGiorno[]
  settimane: RiepilogoSettimana[]
  /** Spaccato dei giustificativi usati nel periodo (solo voci con ore > 0). */
  giustificativi: OrePerVoce[]
  /**
   * Flessibilita' LAVORATA: ore di lavoro oltre il monte ore del giorno, al
   * netto di quanto quel giorno era gia' coperto da assenze. Accumula flessibilità.
   * E' la causale 907 del cedolino.
   */
  flessibilitaLavorata: number
  /**
   * Flessibilita' RECUPERATA: ore dichiarate sulla voce Flessibilita', cioe' ore
   * non lavorate e attinte dal monte di flessibilità. Consuma. Causale 908 del cedolino.
   */
  flessibilitaRecuperata: number
  /**
   * Movimento netto del periodo (lavorata − recuperata). NON e' il saldo
   * disponibile: quello parte dalla dotazione allineata al cedolino, che oggi il
   * sistema non conosce ancora.
   */
  flessibilitaSaldo: number
  /** Notti dichiarate nel periodo: la maggiorazione e' forfettaria, si contano. */
  notti: number
  /** Turni dichiarati in reperibilita' nel periodo. */
  turniReperibilita: number
}

/**
 * Consuntivo ore di un progetto su un periodo, con lo spaccato per persona.
 * `progettoId: null` e' la riga "senza progetto": le ore di progettazione non
 * imputate, che restano visibili invece di sparire in un totale.
 */
export interface OrePerProgetto {
  progettoId: number | null
  nome: string
  ore: number
  persone: { dipendenteId: number; cognomeNome: string; ore: number }[]
}

/** Riga del cruscotto HR: stato del mese per dipendente */
export interface StatoDipendenteMese {
  dipendenteId: number
  cognomeNome: string
  email: string
  oreLavorate: number
  oreAttese: number
  scostamento: number
  giorniIncompleti: number
  /**
   * Nessuna giornata scoperta nel mese: e' la condizione che abilita la chiusura
   * anticipata, prima della scadenza di calendario. Un foglio con i buchi non si
   * chiude, per nessuno.
   */
  completo: boolean
  flessibilitaLavorata: number
  flessibilitaRecuperata: number
  flessibilitaSaldo: number
  notti: number
  turniReperibilita: number
  stato: StatoMese
  fileUrl: string | null
  filePdfUrl: string | null
  fileHrUrl: string | null
  settimane: RiepilogoSettimana[]
  /** Responsabile che deve validare il foglio; null = nessuno assegnato. */
  referenteEmail: string | null
  validatoDa: string | null
  validatoIl: string | null
  confermatoIl: string | null
  confermatoForzato: boolean
  noteContestazione: string | null
  /** Giorni trascorsi dall'invio al dipendente senza risposta (stato validato). */
  giorniInAttesa: number | null
  /**
   * Persona non più abilitata (rapporto chiuso o spunta togliata) che compare
   * comunque perché ha righe o una chiusura in questo mese: le HR devono poter
   * chiudere l'ultimo mese e generare il foglio ore finale.
   */
  disattivato?: boolean
}
