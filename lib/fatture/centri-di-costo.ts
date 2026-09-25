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

/** Minuscole, senza accenti, spazi normalizzati: per confrontare nomi scritti a mano. */
function normalizza(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Riporta i servizi delle richieste passate ai nomi dell'anagrafica.
 *
 * Prima che la lista dei centri di costo esistesse il servizio si scriveva a
 * mano: chi lavora in Locanda ha richieste con «Locanda», e senza questo passo
 * il modulo gli proponeva sia «Locanda» sia «La Locanda nel Parco». Un nome
 * vecchio si aggancia al centro che lo contiene, se è uno solo; se non si
 * aggancia a niente si scarta. Con l'anagrafica vuota i recenti restano come sono.
 */
export function allineaAiCentri(recenti: string[], centri: string[]): string[] {
  if (!centri.length) return recenti
  const out: string[] = []
  for (const r of recenti) {
    const n = normalizza(r)
    if (!n) continue
    const uguale = centri.find((c) => normalizza(c) === n)
    const contiene = centri.filter((c) => normalizza(c).split(' ').includes(n) || normalizza(c).includes(` ${n} `))
    const nome = uguale ?? (contiene.length === 1 ? contiene[0] : undefined)
    if (nome && !out.includes(nome)) out.push(nome)
  }
  return out
}
