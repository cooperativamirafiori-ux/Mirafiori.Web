/**
 * Servizi interni: addebiti fra centri di costo e ripartizione dei costi
 * generali. Piano: docs/servizi-interni-piano.md.
 */

/** Il centro di costo i cui costi si dividono fra i servizi. */
export const CC_COSTI_GENERALI = 'cc23'

export interface AltroCosto {
  descrizione: string
  importo: number
}

export interface AddebitoInterno {
  id: string
  numero: number
  ccDa: string
  ccA: string
  mese: string            // YYYY-MM-01
  descrizione: string
  ore: number
  /** Forfait del mese dell'addebito. null = nessun forfait valido in quel mese. */
  euroOra: number | null
  altriCosti: AltroCosto[]
  /** ore × forfait + altri costi; null se manca il forfait e ci sono ore. */
  totale: number | null
  visto: 'visto' | 'non_torna' | null
  vistoNota: string | null
  vistoDa: string | null
  vistoIl: string | null
  creatoDa: string
  creatoIl: string
  /** Oltre il 10 del mese dopo non si modifica più: si rettifica nel mese seguente. */
  bloccato: boolean
}

export interface DatiAddebito {
  ccDa: string
  ccA: string
  mese: string
  descrizione: string
  ore: number
  altriCosti: AltroCosto[]
}

export interface CentroScelta {
  codice: string
  nome: string
  area: string | null
}

export interface RipartizioneGenerali {
  id: string
  ccOrigine: string
  dal: string
  note: string | null
  creatoDa: string
  creatoIl: string
  quote: Array<{ ccCodice: string; percentuale: number }>
}
