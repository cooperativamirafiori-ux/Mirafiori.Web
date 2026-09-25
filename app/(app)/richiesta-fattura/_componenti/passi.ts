/**
 * I passi del modulo Richiesta Fattura: quali sono, in che ordine, quali campi
 * appartengono a ciascuno.
 *
 * **Perché un modulo a passi.** Lo usano anche persone anziane o con qualche
 * difficoltà (decisione del 24 settembre 2026): una domanda per schermata, con
 * bottoni grandi, si segue meglio di un modulo lungo con trenta campi. Per chi
 * non ha difficoltà è solo più veloce, quindi il modulo è questo per tutti.
 *
 * **La validazione non cambia.** Resta `validaRichiesta()` in types/fatture.ts,
 * la stessa dell'API: qui si decide soltanto a quale passo appartiene ogni
 * errore, così «Avanti» mostra quelli del passo e un errore arrivato dal server
 * riporta chi compila alla schermata giusta. Nessuna regola vive qui.
 */

import type { NuovaRichiestaFatturaInput } from '@/types/fatture'

export type Passo =
  | 'servizio'
  | 'cosa'
  | 'quando'
  | 'cliente'
  | 'dati'
  | 'indirizzo'
  | 'recapiti'
  | 'riepilogo'

type Chiave = keyof NuovaRichiestaFatturaInput

/** Di quale passo è ogni campo. Un campo che non compare qui finisce nel riepilogo. */
const CAMPI_DEL_PASSO: Record<Passo, readonly Chiave[]> = {
  servizio: ['centroCosto'],
  cosa: [
    'descrizione',
    'importo',
    'naturaImporto',
    'aliquota',
    'articoloEsclusione',
    'tipoDocumento',
    'riferimentoDocumento',
  ],
  quando: ['dataPrestazione', 'incassato', 'mezzoPagamento', 'mezzoPagamentoAltro', 'dataIncasso'],
  cliente: ['tipoSoggetto'],
  dati: ['cognome', 'nome', 'ragioneSociale', 'partitaIva', 'senzaPartitaIva', 'codiceFiscale', 'condominio'],
  // La nazionalità si ricava dalla nazione, e la nazione si sceglie qui.
  indirizzo: ['indirizzo', 'cap', 'citta', 'provincia', 'nazione', 'nazionalita'],
  recapiti: ['codiceSdi', 'pec', 'email', 'telefono'],
  riepilogo: ['note', 'clienteId'],
}

const PASSO_DEL_CAMPO: Record<string, Passo> = Object.fromEntries(
  (Object.keys(CAMPI_DEL_PASSO) as Passo[]).flatMap((p) => CAMPI_DEL_PASSO[p].map((c) => [c, p])),
)

/**
 * L'elenco dei passi. Il servizio si chiede solo se non lo sappiamo già (chi
 * compila ha mandato altre richieste) o se chi compila vuole cambiarlo.
 */
export function elencoPassi(chiediServizio: boolean): Passo[] {
  const tutti: Passo[] = ['cosa', 'quando', 'cliente', 'dati', 'indirizzo', 'recapiti', 'riepilogo']
  return chiediServizio ? ['servizio', ...tutti] : tutti
}

export function passoDelCampo(campo: string): Passo {
  return PASSO_DEL_CAMPO[campo] ?? 'riepilogo'
}

/** Solo gli errori che appartengono a quel passo. */
export function erroriDelPasso(errori: Record<string, string>, passo: Passo): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errori).filter(([k, v]) => v && passoDelCampo(k) === passo),
  )
}

/** Il primo passo, nell'ordine dato, che ha almeno un errore. */
export function primoPassoConErrore(
  errori: Record<string, string>,
  passi: readonly Passo[],
): Passo | null {
  for (const p of passi) {
    if (Object.keys(erroriDelPasso(errori, p)).length) return p
  }
  return null
}

/** I passi che descrivono il cliente: se un cliente dall'archivio li supera, si salta al riepilogo. */
export const PASSI_CLIENTE: readonly Passo[] = ['cliente', 'dati', 'indirizzo', 'recapiti']
