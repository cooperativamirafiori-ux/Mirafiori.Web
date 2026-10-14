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

/** Tariffe che per una struttura sostituiscono quelle di base, per figura. */
export type TariffeStrutture = Record<string, Partial<Record<Figura, number>>>

export type Destinatario = 'struttura' | 'esterno'

/** Come si ripete un lavoro. `null` = una volta sola. */
export type Frequenza = 'mensile' | 'settimanale'

/** 1 = lunedì … 7 = domenica. */
export const GIORNI_SETTIMANA = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'] as const

export type StatoRicorrenza = 'attiva' | 'pausa' | 'chiusa'

export const STATI_RICORRENZA: Record<StatoRicorrenza, { etichetta: string; tono: Tono }> = {
  attiva: { etichetta: 'Attiva', tono: 'verde' },
  pausa: { etichetta: 'In pausa', tono: 'ambra' },
  chiusa: { etichetta: 'Chiusa', tono: 'neutro' },
}

/**
 * La pulizia che si ripete: lo stampo da cui nascono i lavori del mese.
 * Ore PER VOLTA (nel mese: × volte), materiali al mese.
 */
export interface Ricorrenza {
  id: string
  destinatario: Destinatario
  strutturaCodice: string | null
  strutturaNome: string | null
  ccCodice: string | null
  cliente: string | null
  titolo: string
  descrizione: string | null
  frequenza: Frequenza
  giornoSettimana: number | null
  orePulizie: number
  oreManutenzione: number
  materiali: number
  stato: StatoRicorrenza
  dalMese: string
}

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
  /** La ricorrenza da cui nasce (o che ha fatto nascere). */
  ricorrenzaId: string | null
  /** Copiati dalla ricorrenza, per mostrarli nella scheda. */
  frequenza: Frequenza | null
  giornoSettimana: number | null
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
  /**
   * Si ripete? Con `settimanale` le ore del preventivo arrivano PER VOLTA e il
   * server le moltiplica per le volte del mese.
   */
  frequenza: Frequenza | null
  giornoSettimana: number | null
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
  /** Le strutture con tariffe proprie (Locanda: detersivi a parte). */
  tariffeStrutture: TariffeStrutture
  /** Ore timbrate sul servizio Cura Ambienti nel mese: è la verità. */
  oreTimbrate: number
  orePreventivate: number
  /** Solo dai lavori consuntivati o addebitati. */
  oreConsuntivate: number
  importoConsuntivato: number
  lavoriAperti: number
}
