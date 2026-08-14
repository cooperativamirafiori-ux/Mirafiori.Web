/**
 * Anagrafica Centri di Costo: la dimensione contabile con cui la cooperativa
 * alloca costi, acquisti e fatture.
 *
 * È un'anagrafica condivisa come `clienti` e `strutture`: non ha schermate
 * proprie, la usa chi ne ha bisogno.
 *
 * Perché non basta la Struttura. Nove centri di costo su ventitré non hanno
 * nessuna sede fisica — l'educativa nelle scuole, Care Leavers, CISA 12, il
 * CAV. La struttura resta un'informazione logistica ("dove sta la caldaia") e,
 * quando c'è, precompila il centro di costo; ma la dimensione contabile
 * obbligatoria è questa.
 *
 * Configurazione: `SP_LIST_CENTRI_COSTO`. Se manca, `getCentriDiCosto()`
 * ritorna un elenco vuoto e chi la usa ripiega su un campo libero — mai
 * un'eccezione: meglio un form spartano che una pagina che non si apre.
 */

import { graphGet } from '@/lib/core/graph'
import { PREFER_NON_INDEXED } from '@/lib/core/sp'

export interface CentroDiCosto {
  id: number      // item ID SharePoint: è ciò che si scrive nei lookup
  codice: string  // cc1…cc23 — chiave stabile, sopravvive alle rinomine
  nome: string
  area: string
  ordine: number
}

const LISTA = () => process.env.SP_LIST_CENTRI_COSTO

/** true se la lista è configurata. */
export function centriDiCostoConfigurati(): boolean {
  return Boolean(process.env.SHAREPOINT_SITE_ID && LISTA())
}

/**
 * Centri di costo attivi, in ordine di `Ordine` (che li raggruppa per area).
 * Non lancia mai: in caso di guaio ritorna un elenco vuoto.
 */
export async function getCentriDiCosto(): Promise<CentroDiCosto[]> {
  const site = process.env.SHAREPOINT_SITE_ID
  const lista = LISTA()
  if (!site || !lista) return []

  try {
    const res = await graphGet<{ value: any[] }>(
      `/sites/${site}/lists/${lista}/items?$select=id&$expand=fields($select=Title,Codice,Area,Attivo,Ordine)&$top=500`,
      PREFER_NON_INDEXED,
    )
    return (res.value ?? [])
      .filter((i) => i.fields?.Attivo !== false)
      .map((i) => ({
        id: Number(i.id),
        codice: (i.fields?.Codice ?? '').trim(),
        nome: (i.fields?.Title ?? '').trim(),
        area: (i.fields?.Area ?? '').trim(),
        ordine: Number(i.fields?.Ordine ?? 999),
      }))
      .filter((c) => c.nome)
      .sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome, 'it'))
  } catch (err) {
    console.error('[centri-costo] lettura fallita, si ripiega su elenco vuoto:', err)
    return []
  }
}
