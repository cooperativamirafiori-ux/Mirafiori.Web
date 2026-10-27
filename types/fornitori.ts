/**
 * Anagrafica Fornitori di Manutenzioni (27 ott 2026).
 *
 * Non è una lista nuova: è la lista SharePoint dei **Tecnici** (`SP_LIST_TECNICI`),
 * quella da cui il pannello di controllo sceglie a chi assegnare un ticket.
 * Così un fornitore inserito qui compare subito nel menu "Tecnico assegnato" e
 * nei suggerimenti di "Inserisci costo", senza due elenchi da tenere allineati.
 *
 * Le colonne PartitaIva, Pec, Indirizzo e Note le aggiunge
 * `scripts/provision-fornitori.mjs`.
 */

export interface Fornitore {
  id: number
  /** `Title` su SP: è il nome che compare nei ticket. */
  nome: string
  ditta: string
  specializzazione: string
  telefono: string
  email: string
  partitaIva: string
  pec: string
  indirizzo: string
  note: string
}

export type DatiFornitore = Omit<Fornitore, 'id'>

const testo = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Legge e controlla il corpo di una POST/PATCH. */
export function leggiDatiFornitore(
  corpo: unknown,
): { dati: DatiFornitore } | { problemi: string[] } {
  const c = (corpo ?? {}) as Record<string, unknown>
  const dati: DatiFornitore = {
    nome: testo(c.nome),
    ditta: testo(c.ditta),
    specializzazione: testo(c.specializzazione),
    telefono: testo(c.telefono),
    email: testo(c.email).toLowerCase(),
    partitaIva: testo(c.partitaIva).toUpperCase().replace(/\s+/g, ''),
    pec: testo(c.pec).toLowerCase(),
    indirizzo: testo(c.indirizzo),
    note: testo(c.note),
  }
  const problemi: string[] = []
  if (!dati.nome) problemi.push('Il nome è obbligatorio')
  const mail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (dati.email && !mail.test(dati.email)) problemi.push('Email non valida')
  if (dati.pec && !mail.test(dati.pec)) problemi.push('PEC non valida')
  return problemi.length ? { problemi } : { dati }
}

/** Testo su cui cerca il filtro dell'elenco. */
export const testoRicerca = (f: Fornitore) =>
  [f.nome, f.ditta, f.specializzazione, f.telefono, f.email, f.partitaIva, f.pec, f.indirizzo]
    .join(' ')
    .toLowerCase()
