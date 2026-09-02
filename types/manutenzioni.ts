// ============================================================
// Tipi che rispecchiano le SharePoint Lists del sistema
// ============================================================

/**
 * Permesso per aprire una richiesta di manutenzione.
 *
 * Vale per la parte "richiedente" dell'area — nuova richiesta e le proprie
 * richieste — e si assegna dal pannello Amministrazione › Permessi: nasce dai
 * responsabili di struttura (scripts/seed-permessi-manutenzioni.mjs), ma la
 * fonte che conta è la lista Autorizzazioni, così si può concederlo a chi non
 * è responsabile e toglierlo a chi lo è.
 *
 * La parte gestionale (pannello di controllo, inserisci costo, cruscotto
 * costi) NON passa da qui: resta su `isAdmin`, scritto nel codice.
 */
export const AREA_MANUTENZIONI = 'Manutenzioni'

export type StatoRichiesta = 'Aperta' | 'In lavorazione' | 'Completata'

export interface Struttura {
  id: number
  title: string       // nome struttura
  codice: string
  strutturaLabel: string  // es. "MIR01 — Sede operativa"
  responsabileEmail: string
  responsabilePulizieEmail: string
  /**
   * Centro di costo di default della struttura. È un suggerimento: precompila
   * il campo quando si registra un costo o un acquisto, ma il valore che conta
   * è quello scritto sul documento (vedi CostoRecord.centroCosto).
   */
  centroCosto?: { id: number; value: string }
}

export interface Tecnico {
  id: number
  title: string   // nome tecnico (SP Title)
  telefono: string
  specializzazione: string
  ditta: string
  email: string
}

export interface RichiestaManutenzione {
  id: number              // ID SharePoint (read-only)
  spItemId: string        // ID interno SP per PATCH (stringa per Graph)
  idRichiesta: string     // Title: "MAN-2026-047"
  richiedente: {
    displayName: string
    email: string      // vuoto: Graph fields non espone Person email; recuperare via User Info List se necessario
    lookupId?: number  // RichiedenteLookupId per filtri e reverse-lookup
  }
  dataRichiesta: string   // ISO datetime
  tipoIntervento: string  // es. "Pulizia straordinaria"
  priorita: string        // es. "Urgente (esecuzione in giornata)"
  stato: StatoRichiesta
  struttura: {
    id: number
    value: string
  }
  descrizione: string
  tecnico?: {
    id: number
    value: string
  }
  tecnicoTelefono?: string
  importoFattura?: number
  oreLavoro?: number      // OrePulizia in SP (display: "Ore Lavoro Interno")
  dataIntervento?: string
  dataPagamento?: string
  pagato: boolean
  noteResponsabile?: string
}

export interface CostoStruttura {
  title: string         // ID richiesta (es. MAN-2026-047)
  dataCosto: string
  categoria: string
  importo: number
  struttura: { id: number }
  fornitore?: string
  periodo?: string      // es. "giugno 2026"
  fonte?: string        // "Manuale"
}

/** Record di costo letto dalla lista Costi Strutture (per il cruscotto) */
export interface CostoRecord {
  id: number            // ID SharePoint item
  title: string         // ID richiesta (MAN-...) o causale del costo diretto
  dataCosto: string     // ISO datetime
  categoria: string
  importo: number
  /**
   * Facoltativa: i servizi senza sede fisica (educativa nelle scuole, Care
   * Leavers, CISA 12…) registrano costi che non stanno in nessun edificio.
   * id = 0 quando non c'è.
   */
  struttura: {
    id: number
    value: string       // nome/label struttura
  }
  /**
   * Centro di costo del movimento. **Copiato qui alla creazione**, non
   * ricavato risalendo alla struttura: se domani una struttura passa a un
   * altro centro di costo, lo storico non si deve riscrivere da solo.
   */
  centroCosto?: {
    id: number
    value: string
  }
  fornitore?: string
  periodo?: string
  fonte?: string        // "Manuale" (da ticket) o "Diretto" (inserito a mano)
  note?: string
}

/**
 * Costi aggregati su una chiave (cruscotto YTD).
 * La chiave è la struttura o il centro di costo, a seconda della vista scelta:
 * stessi movimenti, raggruppamento diverso.
 */
export interface CostoAggregato {
  chiaveId: number
  etichetta: string
  totale: number
  perCategoria: Record<string, number>
  movimenti: CostoRecord[]
}

/** Le due viste del cruscotto costi. */
export type VistaCosti = 'struttura' | 'centro-di-costo'

export interface ParametroConfigurazione {
  title: string   // chiave (es. "Costo orario pulizie")
  valore: number
}

// ============================================================
// Payload per le API routes
// ============================================================

export interface NuovaRichiestaPayload {
  strutturaId: number
  strutturaNome: string
  tipoIntervento: string
  priorita: string
  descrizione: string
}

export interface NuovoCostoPayload {
  /** Il centro di costo è la dimensione contabile obbligatoria. */
  centroCostoId: number
  /** Facoltativa: i servizi senza sede fisica non ne hanno una. */
  strutturaId?: number
  categoria: string
  importo: number
  dataCosto: string      // ISO date (YYYY-MM-DD) o datetime
  fornitore?: string
  causale?: string       // descrizione libera → Title / Note
}

export interface AggiornaRichiestaPayload {
  // Assegnazione tecnico (stato → In lavorazione)
  tecnicoId?: number
  tecnicoNome?: string
  // Chiusura ticket (stato → Completata)
  importoFattura?: number
  oreLavoro?: number
  dataIntervento?: string
  noteResponsabile?: string
}
