/**
 * Centri di costo — elenco per il menu della richiesta fattura.
 *
 * L'anagrafica vera sta in `lib/centri-costo/data.ts`: è condivisa con costi e
 * acquisti. Qui resta solo l'adattamento per quest'area, che salva il **nome**
 * come stringa e non un lookup — così le richieste già inviate restano
 * leggibili anche se un centro di costo viene poi rinominato o disattivato.
 *
 * Elenco vuoto = lista non configurata: il form mostra un campo di testo libero.
 */

import { getCentriDiCosto as getAnagrafica } from '@/lib/centri-costo/data'

/** Nomi dei centri di costo attivi, in ordine alfabetico. */
export async function getCentriDiCosto(): Promise<string[]> {
  const centri = await getAnagrafica()
  return centri
    .map((c) => c.nome)
    .sort((a, b) => a.localeCompare(b, 'it'))
}
