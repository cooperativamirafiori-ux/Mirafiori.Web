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
