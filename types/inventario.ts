// ============================================================
// Inventario Beni — tipi e costanti
//
// Lista SharePoint "Inventario Beni" (SP_LIST_INVENTARIO) + una cartella per
// bene nella libreria documenti indicata da SP_INVENTARIO_DRIVE_ID /
// SP_INVENTARIO_FOLDER, dentro cui finiscono fattura e garanzia.
//
// L'inventario è una lista a sé e non un campo della richiesta di acquisto: un
// bene sopravvive alla richiesta che lo ha generato — si sposta di struttura, va
// in riparazione, viene dismesso — e queste sono informazioni sue, non della
// richiesta. Il legame resta nel campo CodiceRichiesta.
// ============================================================

import type { ModoAcquisizione, TipoIT } from '@/types/it'

export const STATI_BENE = [
  'In uso',
  'In riparazione',
  'In magazzino',
  'Dismesso',
  'Alienato',
  'Smarrito',
  'Annullato',
] as const
export type StatoBene = (typeof STATI_BENE)[number]

/** Stati che tengono il bene fuori dal patrimonio in uso. */
export const STATI_BENE_CHIUSI: StatoBene[] = ['Dismesso', 'Alienato', 'Smarrito', 'Annullato']

export const TIPI_DOCUMENTO = ['fattura', 'garanzia'] as const
export type TipoDocumento = (typeof TIPI_DOCUMENTO)[number]

/** Prefisso del numero di inventario. Il progressivo è continuo, non annuale. */
export const PREFISSO_INVENTARIO = 'INV'
/** Cifre del progressivo: INV-0001. Oltre 9999 il numero cresce senza troncare. */
export const CIFRE_INVENTARIO = 4

export interface BeneInventario {
  spItemId: string
  numero: string // Title, es. "INV-0007"

  descrizione: string
  categoria?: string
  marcaModello?: string
  numeroSerie?: string

  // --- Dispositivi IT (vedi types/it.ts e docs/it-dispositivi-piano.md) ---
  /** Valorizzato ⇒ il bene è un dispositivo IT. È il discriminante dell'area. */
  tipoIT?: TipoIT
  sottoTipo?: string
  /** Marca e modello separati: `marcaModello` resta per compatibilità con Acquisti. */
  marca?: string
  modello?: string
  acquisizione?: ModoAcquisizione
  canoneMensile?: number
  fineNoleggio?: string
  garanzieAccessorie?: string
  /** Riferimento libero alla fattura, dove non c'è una richiesta d'acquisto. */
  fatturaRif?: string
  /** Spunta: ha senso solo sui PC. */
  firewallInstallato?: boolean
  /** Copia dall'assegnazione attiva: la scrive solo l'app. */
  centroDiCosto?: { id: number; value: string }
  assegnatarioMail?: string
  assegnatarioNome?: string
  /** Riferimento alla riga di origine su gruppo_it, es. "DISP-43". */
  idListaIT?: string

  struttura?: { id: number; value: string }
  ubicazione?: string
  statoBene: StatoBene

  dataAcquisto?: string
  fornitore?: string
  valore?: number
  mesiGaranzia?: number
  scadenzaGaranzia?: string

  codiceRichiesta?: string
  richiestaItemId?: string

  cartellaUrl?: string
  fatturaUrl?: string
  fatturaNome?: string
  garanziaUrl?: string
  garanziaNome?: string

  dataDismissione?: string
  note?: string
}

/** Campi con cui un bene nasce da una richiesta di acquisto ordinata. */
export interface NuovoBeneInput {
  descrizione: string
  categoria?: string
  marcaModello?: string
  numeroSerie?: string
  strutturaId?: number
  dataAcquisto?: string
  fornitore?: string
  valore?: number
  mesiGaranzia?: number
  scadenzaGaranzia?: string
  codiceRichiesta?: string
  richiestaItemId?: string
}

/**
 * Campi che l'app lascia modificare dalla pagina Inventario.
 *
 * Sono i soli che cambiano *dopo* l'acquisto: dove sta il bene, in che stato è,
 * quando è uscito dal patrimonio. Numero, importi, fornitore, date e garanzia
 * arrivano dalla richiesta di acquisto e restano di sola lettura, altrimenti il
 * registro e la richiesta che lo ha generato divergono senza che nessuno lo sappia.
 */
export interface AggiornaBenePayload {
  statoBene?: StatoBene
  ubicazione?: string
  strutturaId?: number
  dataDismissione?: string | null
  note?: string
}

/**
 * Campi dei dispositivi IT, modificabili dall'area IT.
 *
 * Qui dentro finiscono anche numero di serie, valore e garanzia — che per i beni
 * nati da una richiesta d'acquisto sono di sola lettura. La regola è una sola e
 * la fa rispettare `aggiornaBeneIT`: **se il bene ha un `codiceRichiesta`, i
 * campi dell'acquisto restano della richiesta**; i 52 dispositivi arrivati dalle
 * liste dell'IT non ne hanno, e i loro dati mancanti si completano da qui.
 */
export interface AggiornaBeneITPayload {
  tipoIT?: TipoIT | null
  sottoTipo?: string
  marca?: string
  modello?: string
  descrizione?: string
  numeroSerie?: string
  acquisizione?: ModoAcquisizione
  canoneMensile?: number | null
  fineNoleggio?: string | null
  garanzieAccessorie?: string
  fatturaRif?: string
  firewallInstallato?: boolean
  dataAcquisto?: string | null
  fornitore?: string
  valore?: number | null
  mesiGaranzia?: number | null
  scadenzaGaranzia?: string | null
}

/** Campi che restano della richiesta d'acquisto quando il bene ne ha una. */
export const CAMPI_DALL_ACQUISTO = [
  'dataAcquisto',
  'fornitore',
  'valore',
  'mesiGaranzia',
  'scadenzaGaranzia',
] as const satisfies ReadonlyArray<keyof AggiornaBeneITPayload>

/** true se il bene è un dispositivo IT. */
export function eBeneIT(b: Pick<BeneInventario, 'tipoIT'>): boolean {
  return Boolean(b.tipoIT)
}

export const STATO_BENE_STILE: Record<string, string> = {
  'In uso':          'bg-emerald-50 text-emerald-700 border-emerald-200',
  'In riparazione':  'bg-amber-50 text-amber-700 border-amber-200',
  'In magazzino':    'bg-blue-50 text-blue-700 border-blue-200',
  'Dismesso':        'bg-gray-100 text-gray-500 border-gray-200',
  'Alienato':        'bg-gray-100 text-gray-500 border-gray-200',
  'Smarrito':        'bg-red-50 text-red-700 border-red-200',
  'Annullato':       'bg-gray-100 text-gray-400 border-gray-200',
}

/** "INV-0007" da 7. Sopra le 9999 unità il numero si allunga da sé. */
export function formattaNumeroInventario(progressivo: number): string {
  return `${PREFISSO_INVENTARIO}-${String(progressivo).padStart(CIFRE_INVENTARIO, '0')}`
}

/** Progressivo numerico da "INV-0007", oppure null se il formato non torna. */
export function progressivoDaNumero(numero?: string | null): number | null {
  const m = String(numero ?? '').trim().match(new RegExp(`^${PREFISSO_INVENTARIO}-(\\d+)$`, 'i'))
  if (!m) return null
  const n = Number(m[1])
  return isFinite(n) ? n : null
}
