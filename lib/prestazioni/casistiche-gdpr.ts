// ============================================================
// Casistiche GDPR per le Prestazioni Occasionali
// ------------------------------------------------------------
// Ogni prestatore firma UNA sola autorizzazione al trattamento dei dati,
// scelta in base ai dati che effettivamente tratta. Le 7 casistiche sono
// documenti .docx già pronti (tabella dei trattamenti pre-filtrata): il
// responsabile ne seleziona una nel form e alla generazione documenti si
// invia a DocuSign il template corrispondente.
//
// `key`   = valore salvato nella colonna SharePoint "CasisticaGdpr"
// `label` = etichetta mostrata nel menù del form
// `file`  = template in lib/templates/prestazione-occasionale/
//
// NB: nessuna dipendenza node qui — il modulo è importato anche dal form
// client (NuovaPrestazioneForm.tsx).
// ============================================================

export interface CasisticaGdpr {
  key: string
  label: string
  file: string
}

export const CASISTICHE_GDPR: readonly CasisticaGdpr[] = [
  { key: 'UFFICIO',      label: 'Ufficio (tutti i trattamenti)',        file: 'Autorizzazione_GDPR_UFFICIO.docx' },
  { key: 'COMUNITA',     label: 'Comunità residenziale per minori',     file: 'Autorizzazione_GDPR_COMUNITA.docx' },
  { key: 'ARTEMISIA',    label: 'Artemisia / IN RETE (Casa rifugio + CAV)', file: 'Autorizzazione_GDPR_ARTEMISIA.docx' },
  { key: 'TERRITORIALE', label: 'Servizio educativa territoriale',      file: 'Autorizzazione_GDPR_TERRITORIALE.docx' },
  { key: 'CPG',          label: 'CPG — Servizio aggregazione giovani',  file: 'Autorizzazione_GDPR_CPG.docx' },
  { key: 'LOCANDA',      label: 'Locanda nel parco (somministrazione)', file: 'Autorizzazione_GDPR_LOCANDA.docx' },
  { key: 'MEDICO',       label: 'Medico competente',                    file: 'Autorizzazione_GDPR_MEDICO.docx' },
] as const

/** Tutte le key valide (per la validazione server-side e la colonna SP) */
export const CASISTICHE_GDPR_KEYS: readonly string[] = CASISTICHE_GDPR.map((c) => c.key)

/** Ritorna la casistica dalla key (undefined se sconosciuta) */
export function casisticaByKey(key?: string): CasisticaGdpr | undefined {
  if (!key) return undefined
  return CASISTICHE_GDPR.find((c) => c.key === key)
}

/**
 * Template GDPR da usare per una casistica. Se la casistica è mancante o non
 * riconosciuta (es. pratiche create prima di questa funzione) ritorna il
 * template generico storico come fallback, così la generazione non si rompe.
 */
export function templateGdprPerCasistica(key?: string): string {
  return casisticaByKey(key)?.file ?? 'Autorizzazione_GDPR_TEMPLATE.docx'
}
