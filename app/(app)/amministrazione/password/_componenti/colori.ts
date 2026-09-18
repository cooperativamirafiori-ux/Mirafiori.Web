/**
 * Un colore fisso per ogni categoria dell'archivio credenziali.
 *
 * Serve a due cose che devono restare coerenti: i **bottoni di filtro** in cima
 * alla pagina e la **pillola** sulla card della voce. Se il bottone "WiFi" è
 * verde acqua, la pillola "WiFi" sulle card deve essere dello stesso verde
 * acqua: è così che si riconosce un gruppo con la coda dell'occhio, senza
 * rileggere l'etichetta.
 *
 * ⚠️ Questo file sta sotto `app/` e non in `types/` per un motivo pratico:
 * `tailwind.config.ts` scansiona solo `app/`, `components/` e `pages/`. Le
 * classi scritte in `types/` verrebbero eliminate dalla build e i bottoni
 * uscirebbero tutti bianchi — con `tsc` verde e nessun errore a runtime.
 *
 * Le classi sono scritte per intero di proposito: Tailwind legge il sorgente
 * come testo, un `bg-${colore}-50` costruito a pezzi non verrebbe mai generato.
 */

export type StileCategoria = {
  /** Pillola sulla card della voce (passata a `Pill` via `cls`) */
  pill: string
  /** Bottone di filtro non selezionato */
  spento: string
  /** Bottone di filtro selezionato */
  attivo: string
}

const NEUTRO: StileCategoria = {
  pill: 'bg-gray-100 text-gray-700 border-gray-200',
  spento: 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100',
  attivo: 'bg-gray-200 text-gray-900 border-gray-400 ring-2 ring-gray-300',
}

/** Chiavi = valori di CATEGORIE_PASSWORD in `types/password.ts`. */
const STILI: Record<string, StileCategoria> = {
  'Banche e pagamenti': {
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    spento: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
    attivo: 'bg-emerald-100 text-emerald-900 border-emerald-400 ring-2 ring-emerald-300',
  },
  'Enti e portali PA': {
    pill: 'bg-blue-100 text-blue-800 border-blue-200',
    spento: 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100',
    attivo: 'bg-blue-100 text-blue-900 border-blue-400 ring-2 ring-blue-300',
  },
  Fornitori: {
    pill: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    spento: 'bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100',
    attivo: 'bg-yellow-100 text-yellow-900 border-yellow-400 ring-2 ring-yellow-300',
  },
  'Posta e domini': {
    pill: 'bg-violet-100 text-violet-800 border-violet-200',
    spento: 'bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100',
    attivo: 'bg-violet-100 text-violet-900 border-violet-400 ring-2 ring-violet-300',
  },
  'Sito e social': {
    pill: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
    spento: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200 hover:bg-fuchsia-100',
    attivo: 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-400 ring-2 ring-fuchsia-300',
  },
  Software: {
    pill: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    spento: 'bg-cyan-50 text-cyan-800 border-cyan-200 hover:bg-cyan-100',
    attivo: 'bg-cyan-100 text-cyan-900 border-cyan-400 ring-2 ring-cyan-300',
  },
  Strutture: {
    pill: 'bg-orange-100 text-orange-800 border-orange-200',
    spento: 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100',
    attivo: 'bg-orange-100 text-orange-900 border-orange-400 ring-2 ring-orange-300',
  },
  Utenze: {
    pill: 'bg-rose-100 text-rose-800 border-rose-200',
    spento: 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100',
    attivo: 'bg-rose-100 text-rose-900 border-rose-400 ring-2 ring-rose-300',
  },
  WiFi: {
    pill: 'bg-teal-100 text-teal-800 border-teal-200',
    spento: 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100',
    attivo: 'bg-teal-100 text-teal-900 border-teal-400 ring-2 ring-teal-300',
  },
  Altro: NEUTRO,
}

/**
 * Stile di una categoria. Una categoria sconosciuta (voce vecchia, categoria
 * rinominata a mano su SharePoint) non rompe niente: esce grigia.
 */
export function stileCategoria(categoria: string): StileCategoria {
  return STILI[categoria] ?? NEUTRO
}

/** Il bottone "Tutte": grigio scuro, si distingue dai colori delle categorie. */
export const STILE_TUTTE: StileCategoria = {
  pill: NEUTRO.pill,
  spento: 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
  attivo: 'bg-slate-700 text-white border-slate-700 ring-2 ring-slate-300',
}
