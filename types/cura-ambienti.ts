/**
 * Cura Ambienti — centro di servizio interno (cc24).
 * Piano e decisioni: docs/cura-ambienti-piano.md
 */

/** Codice del centro di costo di Cura Ambienti. Chi lo coordina entra nella sezione. */
export const CC_CURA_AMBIENTI = 'cc24'

export type Figura = 'pulizie' | 'manutenzione'

export type StatoLavoro =
  | 'bozza'
  | 'preventivato'
  | 'in_corso'
  | 'consuntivato'
  | 'addebitato'
  | 'annullato'

export type Tono = 'neutro' | 'azzurro' | 'ambra' | 'verde' | 'viola' | 'rosso'

export const STATI_LAVORO: Record<StatoLavoro, { etichetta: string; tono: Tono }> = {
  bozza: { etichetta: 'Bozza', tono: 'neutro' },
  preventivato: { etichetta: 'Preventivato', tono: 'azzurro' },
  in_corso: { etichetta: 'In corso', tono: 'ambra' },
  consuntivato: { etichetta: 'Consuntivato', tono: 'verde' },
  addebitato: { etichetta: 'Addebitato', tono: 'viola' },
  annullato: { etichetta: 'Annullato', tono: 'rosso' },
}

/** Tariffa €/h per figura valida nel mese; null se non c'è ancora. */
export interface Tariffe {
  pulizie: number | null
  manutenzione: number | null
}

export type Destinatario = 'struttura' | 'esterno'

export interface Lavoro {
  id: string
  numero: number
  /** Mese di competenza, `YYYY-MM-01`. */
  mese: string
  destinatario: Destinatario
  strutturaCodice: string | null
  strutturaNome: string | null
  ccCodice: string | null
  cliente: string | null
  titolo: string
  descrizione: string | null
  ricorrente: boolean
  copiatoDa: string | null
  stato: StatoLavoro
  prevOrePulizie: number
  prevOreManutenzione: number
  prevMateriali: number
  consOrePulizie: number | null
  consOreManutenzione: number | null
  consMateriali: number | null
  noteConsuntivo: string | null
  vistoDa: string | null
  vistoIl: string | null
  creatoDa: string
  creatoIl: string
  aggiornatoIl: string
  consuntivatoIl: string | null
}

export interface ImportiLavoro {
  /** null se manca una tariffa che serve. */
  preventivo: number | null
  consuntivo: number | null
  /** consuntivo − preventivo, se ci sono tutti e due. */
  scostamento: number | null
}

export interface LavoroConImporti extends Lavoro {
  importi: ImportiLavoro
}

/** Ciò che il coordinatore compila: il resto lo mette il server. */
export interface DatiLavoro {
  mese: string
  destinatario: Destinatario
  strutturaCodice: string | null
  cliente: string | null
  titolo: string
  descrizione: string | null
  ricorrente: boolean
  prevOrePulizie: number
  prevOreManutenzione: number
  prevMateriali: number
  consOrePulizie: number | null
  consOreManutenzione: number | null
  consMateriali: number | null
  noteConsuntivo: string | null
}

export interface StrutturaScelta {
  codice: string
  nome: string
  ccCodice: string | null
  ccNome: string | null
}

export interface RiepilogoMese {
  mese: string
  tariffe: Tariffe
  /** Ore timbrate sul servizio Cura Ambienti nel mese: è la verità. */
  oreTimbrate: number
  orePreventivate: number
  /** Solo dai lavori consuntivati o addebitati. */
  oreConsuntivate: number
  importoConsuntivato: number
  lavoriAperti: number
}
