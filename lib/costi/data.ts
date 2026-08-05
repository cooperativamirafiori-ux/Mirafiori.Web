/**
 * Costi delle strutture: quelli generati dalle manutenzioni e quelli inseriti
 * a mano (costo diretto).
 */

import { graphGet, graphPost } from '@/lib/core/graph'
import { listBase, lookupValue, PREFER_NON_INDEXED } from '@/lib/core/sp'
import type { Struttura, CostoRecord } from '@/types/manutenzioni'

export async function creaCosto(fields: {
  Title: string
  DataCosto: string
  Categoria: string           // Choice → stringa semplice
  Importo: number
  StrutturaLookupId: number   // Lookup → {Campo}LookupId
  Fornitore?: string
  Periodo?: string
  Fonte?: string              // Choice → stringa semplice
}): Promise<void> {
  await graphPost(`${listBase('costi')}`, { fields })
}

// Campi da leggere dalla lista Costi Strutture.
// Struttura è un lookup → { Value, LookupId } (oppure stringa semplice via fields-expansion)
const COSTO_FIELDS =
  'id,fields&$expand=fields($select=Title,DataCosto,Categoria,Importo,Struttura,StrutturaLookupId,Fornitore,Periodo,Fonte,Note)'

function mapCosto(item: any): CostoRecord {
  const f = item.fields
  return {
    id: Number(item.id),
    title: f.Title ?? '',
    dataCosto: f.DataCosto ?? '',
    categoria: lookupValue(f.Categoria) || 'Non categorizzato',
    importo: typeof f.Importo === 'number' ? f.Importo : Number(f.Importo ?? 0),
    struttura: {
      id: f.Struttura?.LookupId ?? f.StrutturaLookupId ?? 0,
      value: lookupValue(f.Struttura),
    },
    fornitore: f.Fornitore ?? undefined,
    periodo: f.Periodo ?? undefined,
    fonte: lookupValue(f.Fonte) || undefined,
    note: f.Note ?? undefined,
  }
}

/**
 * Legge i record della lista Costi Strutture.
 * Se `anno` è indicato, filtra client-side per anno di DataCosto.
 */
export async function getCosti(anno?: number): Promise<CostoRecord[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase('costi')}?$select=${COSTO_FIELDS}&$orderby=fields/DataCosto desc&$top=2000`,
    PREFER_NON_INDEXED
  )
  let costi = res.value.map(mapCosto)
  if (anno) {
    costi = costi.filter((c) => {
      const d = new Date(c.dataCosto)
      return !isNaN(d.getTime()) && d.getFullYear() === anno
    })
  }
  return costi
}

/**
 * Inserisce un costo direttamente su una struttura, senza passare da una
 * richiesta di manutenzione. Fonte = "Diretto".
 */
export async function creaCostoDiretto(fields: {
  StrutturaLookupId: number
  Categoria: string
  Importo: number
  DataCosto: string
  Fornitore?: string
  Causale?: string
}): Promise<void> {
  const dataObj = new Date(fields.DataCosto)
  const periodo = isNaN(dataObj.getTime())
    ? ''
    : dataObj.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

  const title = fields.Causale?.trim() || `Costo diretto — ${fields.Categoria}`

  const base = {
    Title: title,
    DataCosto: dataObj.toISOString(),
    Categoria: fields.Categoria,
    Importo: fields.Importo,
    StrutturaLookupId: fields.StrutturaLookupId,
    Fornitore: fields.Fornitore?.trim() || undefined,
    Periodo: periodo,
  }

  // Fonte è una colonna Choice: "Diretto" potrebbe non essere tra i valori
  // ammessi (fill-in disabilitato). Provo con "Diretto", altrimenti ripiego
  // su "Manuale" (valore già usato dai flussi, quindi sicuramente valido).
  try {
    await creaCosto({ ...base, Fonte: 'Diretto' })
  } catch (err) {
    console.warn('[SP] creaCostoDiretto: Fonte="Diretto" rifiutata, ripiego su "Manuale"', err)
    await creaCosto({ ...base, Fonte: 'Manuale' })
  }
}

// ============================================================
// Admin check (lista Admin Manutenzioni)
// Lista SP con colonna "Utente" (Person) — ogni riga è un admin
// ============================================================
