/**
 * Nuovo cliente dal QR — i dati che il cliente scrive da solo, dal suo telefono.
 *
 * Il QR è stampato e sta alla cassa: la pagina è **pubblica**, senza login.
 * Le regole su cosa è obbligatorio NON si riscrivono qui: si prende
 * `validaRichiesta()` della Richiesta Fattura, la si fa girare con una richiesta
 * finta attorno ai dati del cliente e si tengono solo gli errori dell'anagrafica.
 * Così se l'ufficio cambia un campo obbligatorio, cambia anche qui.
 *
 * Nessun import server: lo usano sia il modulo sia l'API.
 */

import {
  intestatario,
  richiestaVuota,
  pulisciCampiNascosti,
  validaRichiesta,
  type NuovaRichiestaFatturaInput,
  type TipoSoggetto,
} from '@/types/fatture'

export interface NuovoClienteInput {
  tipoSoggetto: TipoSoggetto | ''
  cognome: string
  nome: string
  ragioneSociale: string
  partitaIva: string
  senzaPartitaIva: boolean
  codiceFiscale: string
  indirizzo: string
  cap: string
  citta: string
  provincia: string
  /** Codice ISO: IT, FR… */
  nazione: string
  telefono: string
  email: string
  pec: string
  codiceSdi: string
}

export function nuovoClienteVuoto(): NuovoClienteInput {
  return {
    tipoSoggetto: '',
    cognome: '',
    nome: '',
    ragioneSociale: '',
    partitaIva: '',
    senzaPartitaIva: false,
    codiceFiscale: '',
    indirizzo: '',
    cap: '',
    citta: '',
    provincia: '',
    nazione: 'IT',
    telefono: '',
    email: '',
    pec: '',
    codiceSdi: '',
  }
}

/** I campi di questo modulo, nell'ordine in cui compaiono: serve a scorrere al primo errore. */
export const CAMPI_NUOVO_CLIENTE: ReadonlyArray<keyof NuovoClienteInput> = [
  'tipoSoggetto',
  'cognome',
  'nome',
  'ragioneSociale',
  'partitaIva',
  'codiceFiscale',
  'nazione',
  'indirizzo',
  'citta',
  'cap',
  'provincia',
  'codiceSdi',
  'pec',
  'email',
  'telefono',
]

/** Il cliente come lo vede la Richiesta Fattura: stessi campi, più il contorno di una richiesta. */
function comeRichiesta(c: NuovoClienteInput): NuovaRichiestaFatturaInput {
  return {
    ...richiestaVuota(),
    ...c,
    nazionalita: c.nazione === 'IT' ? 'Italiana' : 'Estera',
    // Il contorno di una richiesta: valori qualsiasi pur di non generare errori
    // che qui non c'entrano. Gli errori si filtrano comunque sotto.
    centroCosto: '-',
    descrizione: '-',
    importo: '1',
  }
}

/**
 * I messaggi della Richiesta Fattura parlano a chi sta alla cassa («chiedili al
 * cliente»); qui legge il cliente stesso. Si riscrivono solo quelli che
 * parlerebbero di lui in terza persona.
 */
const MESSAGGI_AL_CLIENTE: Record<string, (m: string) => string> = {
  tipoSoggetto: () => "Dicci se sei una persona o un'azienda",
  partitaIva: (m) => (m.includes('«') ? 'Scrivi la partita IVA, oppure spunta «Non ho la partita IVA»' : m),
  codiceSdi: (m) => (m.includes('chiedili') ? 'Serve il codice destinatario oppure la PEC' : m),
}

/** Svuota i campi che la tipologia scelta non prevede, come fa la Richiesta Fattura. */
export function pulisciNuovoCliente(c: NuovoClienteInput): NuovoClienteInput {
  const p = pulisciCampiNascosti(comeRichiesta(c))
  const out = { ...c }
  for (const k of Object.keys(out) as Array<keyof NuovoClienteInput>) {
    ;(out as any)[k] = (p as any)[k]
  }
  return out
}

export function validaNuovoCliente(c: NuovoClienteInput): Record<string, string> {
  const tutti = validaRichiesta(pulisciCampiNascosti(comeRichiesta(c)))
  const miei = new Set<string>([...CAMPI_NUOVO_CLIENTE, 'nazionalita'])
  const e: Record<string, string> = {}
  for (const [k, v] of Object.entries(tutti)) {
    if (!v || !miei.has(k)) continue
    // Qui la nazionalità non si chiede: si ricava dalla nazione.
    const chiave = k === 'nazionalita' ? 'nazione' : k
    e[chiave] = MESSAGGI_AL_CLIENTE[chiave]?.(v) ?? v
  }
  return e
}

/** Come si chiama in fattura: la stessa regola della Richiesta Fattura. */
export function denominazioneDi(c: NuovoClienteInput): string {
  return intestatario(c)
}
