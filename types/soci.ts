/**
 * Domanda di ammissione a socio — tipi, costanti e validazione.
 *
 * Il modulo è quello cartaceo della cooperativa ("Al Consiglio di
 * Amministrazione e/o Amministratore Unico… domanda di ammissione a socio/a"),
 * rifatto uguale in lib/templates/domanda-socio/. Decisioni di Dennis del
 * 29/10/2026 in docs/ammissione-soci.md.
 *
 * File isomorfo: lo usano sia il form nel browser sia le API.
 */

/** I tre tipi del modulo cartaceo, con il valore corrispondente della scheda RU. */
export const TIPI_SOCIO = [
  { valore: 'lavoratore', etichetta: 'Socio/a lavoratore - lavoratrice', ru: 'Socio lavoratore' },
  { valore: 'volontario', etichetta: 'Socio/a volontario/a', ru: 'Socio volontario' },
  { valore: 'sovventore', etichetta: 'Socio/a sovventore - sovventrice', ru: 'Socio sovventore e finanziatore' },
] as const
export type TipoSocio = (typeof TIPI_SOCIO)[number]['valore']

export const MODALITA_VERSAMENTO = [
  { valore: 'trattenute', etichetta: 'Trattenute in busta paga' },
  { valore: 'cassa', etichetta: 'Versate di cassa o tramite bonifico' },
] as const
export type ModalitaVersamento = (typeof MODALITA_VERSAMENTO)[number]['valore']

/**
 * Quote da 25 € l'una: il NUMERO lo scrive il socio nel modulo (Dennis,
 * 30/10/2026; dal 29/10 erano 80 fisse). NUMERO_QUOTE resta solo come ripiego
 * per le domande salvate prima, che il numero non ce l'hanno.
 */
export const IMPORTO_QUOTA = 25
export const NUMERO_QUOTE = 80
export const MAX_QUOTE = 9999
/** Il numero di quote della domanda (ripiego 80 per le domande vecchie). */
export const quoteDi = (d: { numeroQuote?: string }) => {
  const n = Number(d.numeroQuote)
  return Number.isInteger(n) && n > 0 ? n : NUMERO_QUOTE
}
export const totaleQuote = (n: number) => n * IMPORTO_QUOTA

export const STATI_DOMANDA = ['In attesa di firma', 'Firmata', 'Registrata'] as const
export type StatoDomanda = (typeof STATI_DOMANDA)[number]

/** I dati che il futuro socio scrive nel modulo. */
export interface DatiDomanda {
  cognome: string
  nome: string
  luogoNascita: string
  provNascita: string
  /** YYYY-MM-DD */
  dataNascita: string
  codiceFiscale: string
  cittadinanza: string
  professione: string
  comuneResidenza: string
  provResidenza: string
  indirizzo: string
  telefono: string
  tipoSocio: TipoSocio | ''
  /** Quante quote da 25 € sottoscrive: lo scrive lui. */
  numeroQuote: string
  modalita: ModalitaVersamento | ''
}

export const DATI_VUOTI: DatiDomanda = {
  cognome: '', nome: '', luogoNascita: '', provNascita: '', dataNascita: '',
  codiceFiscale: '', cittadinanza: '', professione: '', comuneResidenza: '',
  provResidenza: '', indirizzo: '', telefono: '', tipoSocio: '', numeroQuote: '', modalita: '',
}

/** Una domanda come la vede il form. */
export interface Domanda {
  spItemId: string
  stato: StatoDomanda
  dati: DatiDomanda
  numeroElencoGenerale: number | null
  /** YYYY-MM-DD: la data scritta sul modulo ("Torino, …"). */
  dataDomanda: string | null
  domandaUrl: string | null
  domandaNome: string | null
  schedaUrl: string | null
}

const CF = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/
const PROV = /^[A-Z]{2}$/

/** Ripulisce i dati arrivati dal browser: solo le chiavi note, testo rifilato. */
export function normalizzaDati(input: unknown): DatiDomanda {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const s = (k: keyof DatiDomanda) => (typeof o[k] === 'string' ? (o[k] as string).trim().replace(/\s+/g, ' ') : '')
  const tipo = s('tipoSocio')
  const mod = s('modalita')
  return {
    cognome: s('cognome').toUpperCase(),
    nome: s('nome').toUpperCase(),
    luogoNascita: s('luogoNascita'),
    provNascita: s('provNascita').toUpperCase(),
    dataNascita: s('dataNascita').slice(0, 10),
    codiceFiscale: s('codiceFiscale').toUpperCase().replace(/\s/g, ''),
    cittadinanza: s('cittadinanza'),
    professione: s('professione'),
    comuneResidenza: s('comuneResidenza'),
    provResidenza: s('provResidenza').toUpperCase(),
    indirizzo: s('indirizzo'),
    telefono: s('telefono'),
    tipoSocio: TIPI_SOCIO.some((t) => t.valore === tipo) ? (tipo as TipoSocio) : '',
    numeroQuote: s('numeroQuote').replace(/\D/g, '').replace(/^0+/, ''),
    modalita: MODALITA_VERSAMENTO.some((m) => m.valore === mod) ? (mod as ModalitaVersamento) : '',
  }
}

/** Errori campo per campo; oggetto vuoto se è tutto a posto. */
export function validaDati(d: DatiDomanda): Partial<Record<keyof DatiDomanda, string>> {
  const e: Partial<Record<keyof DatiDomanda, string>> = {}
  const obbligatori: (keyof DatiDomanda)[] = [
    'cognome', 'nome', 'luogoNascita', 'provNascita', 'dataNascita', 'codiceFiscale',
    'cittadinanza', 'professione', 'comuneResidenza', 'provResidenza', 'indirizzo', 'telefono',
  ]
  for (const k of obbligatori) if (!d[k]) e[k] = 'Da compilare'
  if (d.codiceFiscale && !CF.test(d.codiceFiscale)) e.codiceFiscale = 'Codice fiscale non valido (16 caratteri)'
  if (d.provNascita && !PROV.test(d.provNascita)) e.provNascita = 'Sigla di 2 lettere (es. TO). Se sei nato/a all’estero scrivi EE'
  if (d.provResidenza && !PROV.test(d.provResidenza)) e.provResidenza = 'Sigla di 2 lettere (es. TO)'
  if (d.dataNascita && !/^\d{4}-\d{2}-\d{2}$/.test(d.dataNascita)) e.dataNascita = 'Data non valida'
  if (!d.tipoSocio) e.tipoSocio = 'Scegli come vuoi essere ammesso/a'
  const nq = Number(d.numeroQuote)
  if (!d.numeroQuote) e.numeroQuote = 'Scrivi quante quote vuoi sottoscrivere'
  else if (!Number.isInteger(nq) || nq < 1 || nq > MAX_QUOTE) e.numeroQuote = `Un numero da 1 a ${MAX_QUOTE}`
  if (!d.modalita) e.modalita = 'Scegli come versare le quote'
  return e
}

export const etichettaTipo = (t: string) => TIPI_SOCIO.find((x) => x.valore === t)?.etichetta ?? ''
export const tipoRU = (t: string) => TIPI_SOCIO.find((x) => x.valore === t)?.ru ?? ''
