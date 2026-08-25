// ============================================================
// Area IT e Dispositivi — tipi e costanti
//
// Due anagrafiche e due liste di legame:
//   · i dispositivi stanno nell'Inventario Beni (types/inventario.ts): un
//     portatile è un bene come un trapano, e un registro unico evita di avere
//     due record e due codici per la stessa macchina;
//   · le SIM hanno una lista propria: non sono beni ma contratti ricorrenti;
//   · ogni periodo di assegnazione è una riga, in "Assegnazioni Beni" o in
//     "Assegnazioni SIM". Le due liste hanno la stessa forma, quindi qui c'è un
//     tipo unico e il codice che le legge è uno solo (lib/it/assegnazioni.ts).
//
// Le decisioni e il perché stanno in docs/it-dispositivi-piano.md.
// ============================================================

/** Permesso d'area: si concede da Amministrazione › Permessi. */
export const AREA_IT = 'IT e Dispositivi'

// ------------------------------------------------------------
// Dispositivi
// ------------------------------------------------------------

/**
 * Discriminante fra un bene IT e un bene qualsiasi: **se `TipoIT` è
 * valorizzato, il bene è IT**.
 *
 * Non si usa `Categoria = Informatica` perché quella è la categoria contabile
 * che il bene eredita dalla richiesta d'acquisto: la decide chi compra, e un
 * monitor può finire in "Attrezzatura" senza che nessuno abbia sbagliato.
 * Tenendole separate, la classificazione contabile e quella tecnica non si
 * rompono a vicenda.
 */
export const TIPI_IT = ['PC', 'Smartphone', 'Tablet', 'Stampante', 'Periferiche', 'Rete', 'Altro'] as const
export type TipoIT = (typeof TIPI_IT)[number]

/** Tipi su cui la spunta del firewall ha senso. */
export const TIPI_CON_FIREWALL: TipoIT[] = ['PC']

export const MODI_ACQUISIZIONE = ['Acquisto', 'Noleggio', 'Donazione'] as const
export type ModoAcquisizione = (typeof MODI_ACQUISIZIONE)[number]

/** Voce dell'anagrafica Centri di Costo, come la usano i menu dell'area. */
export interface CentroDiCostoVoce {
  id: number
  nome: string
  area: string
}

// ------------------------------------------------------------
// Assegnazioni (beni e SIM: stessa forma)
// ------------------------------------------------------------

export const STATI_ASSEGNAZIONE = ['Attiva', 'Chiusa'] as const
export type StatoAssegnazione = (typeof STATI_ASSEGNAZIONE)[number]

/** Su quale delle due liste stiamo lavorando. */
export type GenereAssegnazione = 'bene' | 'sim'

export interface Assegnazione {
  spItemId: string
  titolo: string
  genere: GenereAssegnazione

  /** Item id del bene o della SIM assegnata. */
  oggettoId: number
  /** Come si chiama l'oggetto, per mostrarlo senza una seconda lettura. */
  oggettoEtichetta: string

  /**
   * Chi ce l'ha. **Facoltativo**: NAS, stampanti e fax non stanno in mano a
   * nessuno, stanno in un servizio. Il centro di costo invece non lo è.
   */
  assegnatarioMail?: string
  assegnatarioNome?: string

  centroDiCosto?: { id: number; value: string }
  /** Il vecchio campo "Servizio" a testo libero delle liste IT: si conserva. */
  servizioLegacy?: string
  /** Nome dell'utenza sulla macchina ("NB-Stefano13"): cambia col possessore. */
  nomeUtenza?: string

  dataAssegnazione: string
  dataFine?: string
  stato: StatoAssegnazione
  note?: string

  verbaleConsegnaUrl?: string
  verbaleConsegnaNome?: string
  verbaleRestituzioneUrl?: string
  verbaleRestituzioneNome?: string

  /** Riferimento alla riga di origine su gruppo_it, es. "ASG-13". */
  idListaIT?: string
}

/** Campi con cui nasce un'assegnazione. */
export interface NuovaAssegnazione {
  oggettoId: number
  assegnatarioMail?: string
  assegnatarioNome?: string
  centroDiCostoId: number
  nomeUtenza?: string
  dataAssegnazione: string
  note?: string
}

/** Cosa si può correggere su un'assegnazione già scritta. */
export interface ModificaAssegnazione {
  assegnatarioMail?: string | null
  assegnatarioNome?: string | null
  centroDiCostoId?: number
  nomeUtenza?: string
  note?: string
  /** Correzione della data di inizio: serve alle righe migrate con la data di impianto. */
  dataAssegnazione?: string
  /** Chiusura: la data di restituzione (o di cessazione, per le SIM). */
  dataFine?: string | null
  stato?: StatoAssegnazione
}

export const TIPI_VERBALE = ['consegna', 'restituzione'] as const
export type TipoVerbale = (typeof TIPI_VERBALE)[number]

/**
 * Le due cartelle fisse dei verbali, alla radice della libreria dell'inventario.
 * Nessuna sottocartella per bene: il codice di inventario sta nel nome del file,
 * così i verbali si trovano per numero anche cercando da SharePoint.
 */
export const CARTELLE_VERBALI: Record<TipoVerbale, string> = {
  consegna: 'Verbali Consegna',
  restituzione: 'Verbali Restituzione',
}

// ------------------------------------------------------------
// SIM
// ------------------------------------------------------------

export const STATI_SIM = ['Attiva', 'Cessata', 'In attesa', 'Bloccata'] as const
export type StatoSim = (typeof STATI_SIM)[number]

/** Stati che tengono la SIM fuori dalle utenze vive. */
export const STATI_SIM_CHIUSI: StatoSim[] = ['Cessata']

export const TIPI_PIANO = ['Voce + Dati', 'Dati', 'Voce', 'Altro'] as const
export type TipoPiano = (typeof TIPI_PIANO)[number]

export interface Sim {
  spItemId: string
  /** ICCID, il seriale stampato sulla scheda: è il Title della lista. */
  iccid: string
  numero: string

  operatore?: string
  tipoPiano?: TipoPiano
  nomePiano?: string
  fornitore?: string

  dataAttivazione?: string
  dataCessazione?: string
  riferimentoContratto?: string
  stato: StatoSim
  costoMensile?: number
  note?: string

  /** Copia dall'assegnazione attiva: la scrive solo l'app. */
  centroDiCosto?: { id: number; value: string }
  assegnatarioMail?: string
  assegnatarioNome?: string
  /** Lo smartphone in cui sta la scheda, se lo sappiamo. */
  beneAssociato?: { id: number; value: string }

  idListaIT?: string
}

export interface NuovaSim {
  iccid: string
  numero: string
  operatore?: string
  tipoPiano?: TipoPiano
  nomePiano?: string
  fornitore?: string
  dataAttivazione?: string
  riferimentoContratto?: string
  costoMensile?: number
  note?: string
}

export interface ModificaSim {
  numero?: string
  operatore?: string
  tipoPiano?: TipoPiano
  nomePiano?: string
  fornitore?: string
  dataAttivazione?: string | null
  dataCessazione?: string | null
  riferimentoContratto?: string
  stato?: StatoSim
  costoMensile?: number | null
  note?: string
  beneAssociatoId?: number | null
}

export const STATO_SIM_STILE: Record<string, string> = {
  Attiva: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'In attesa': 'bg-amber-50 text-amber-700 border-amber-200',
  Bloccata: 'bg-red-50 text-red-700 border-red-200',
  Cessata: 'bg-gray-100 text-gray-500 border-gray-200',
}

// ------------------------------------------------------------
// Aiuti condivisi
// ------------------------------------------------------------

/** Numero di telefono in forma confrontabile: solo cifre, senza prefisso. */
export function numeroNormalizzato(numero?: string | null): string {
  const cifre = String(numero ?? '').replace(/\D/g, '')
  return cifre.startsWith('39') ? cifre.slice(2) : cifre
}

/**
 * Etichetta di chi ha in carico qualcosa. Per i beni condivisi non c'è una
 * persona: si mostra il centro di costo, che è l'informazione vera.
 */
export function chiLoHa(a?: Assegnazione | null): string {
  if (!a || a.stato !== 'Attiva') return 'nessuno'
  if (a.assegnatarioNome) return a.assegnatarioNome
  if (a.assegnatarioMail) return a.assegnatarioMail
  if (a.centroDiCosto?.value) return `${a.centroDiCosto.value} (in condivisione)`
  return 'assegnatario non indicato'
}
