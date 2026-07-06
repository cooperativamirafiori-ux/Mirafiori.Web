// ============================================================
// Tipi che rispecchiano le SharePoint Lists del sistema
// ============================================================

export type StatoRichiesta = 'Aperta' | 'In lavorazione' | 'Completata'

export interface Struttura {
  id: number
  title: string       // nome struttura
  codice: string
  strutturaLabel: string  // es. "MIR01 — Sede operativa"
  responsabileEmail: string
  responsabilePulizieEmail: string
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
  struttura: {
    id: number
    value: string       // nome/label struttura
  }
  fornitore?: string
  periodo?: string
  fonte?: string        // "Manuale" (da ticket) o "Diretto" (inserito a mano)
  note?: string
}

/** Costi aggregati per una singola struttura (cruscotto YTD) */
export interface CostoPerStruttura {
  strutturaId: number
  strutturaLabel: string
  totale: number
  perCategoria: Record<string, number>
  movimenti: CostoRecord[]
}

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
  strutturaId: number
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
