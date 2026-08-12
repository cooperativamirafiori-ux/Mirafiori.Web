/**
 * Centri di costo — elenco per il menu della richiesta fattura.
 *
 * **Oggi l'elenco non esiste ancora.** La lista Aree/Centri di Costo è in attesa
 * di approvazione in ufficio (vedi la nota di agosto 2026), quindi questa
 * funzione ritorna un elenco vuoto e il form mostra un campo di testo libero.
 *
 * Quando la lista sarà pronta non c'è codice da scrivere: si crea la lista
 * SharePoint con il nome del centro di costo nella colonna Title, si imposta
 *
 *   SP_LIST_CENTRI_COSTO=<guid della lista>
 *
 * e da quel momento questa funzione la legge e il form diventa da sé un menu a
 * tendina. È l'unico punto dell'area che deve sapere da dove arrivano i centri
 * di costo: `data.ts` salva comunque una stringa, così le richieste già inviate
 * restano leggibili anche se un centro di costo viene poi rinominato.
 */

import { graphGet } from '@/lib/core/graph'

const PREFER_NON_INDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

/**
 * Nomi dei centri di costo, in ordine alfabetico. Elenco vuoto = campo libero.
 *
 * Non lancia mai: se la lista è configurata male, meglio un campo di testo che
 * una pagina che non si apre.
 */
export async function getCentriDiCosto(): Promise<string[]> {
  const site = process.env.SHAREPOINT_SITE_ID
  const list = process.env.SP_LIST_CENTRI_COSTO
  if (!site || !list) return []

  try {
    const res = await graphGet<{ value: Array<{ fields?: { Title?: string } }> }>(
      `/sites/${site}/lists/${list}/items?$select=id&$expand=fields($select=Title)&$top=500`,
      PREFER_NON_INDEXED,
    )
    const nomi = (res.value ?? [])
      .map((i) => (i.fields?.Title ?? '').trim())
      .filter(Boolean)
    return Array.from(new Set(nomi)).sort((a, b) => a.localeCompare(b, 'it'))
  } catch (err) {
    console.error('[fatture] getCentriDiCosto fallito, si resta a campo libero:', err)
    return []
  }
}
