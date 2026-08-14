/**
 * Costi delle strutture: quelli generati dalle manutenzioni e quelli inseriti
 * a mano (costo diretto).
 */

import { graphGet, graphPost } from '@/lib/core/graph'
import { listBase, lookupValue, PREFER_NON_INDEXED } from '@/lib/core/sp'
import type { Struttura, CostoRecord } from '@/types/manutenzioni'

/**
 * Unico punto in cui nasce una riga di costo: ci passano il costo diretto, la
 * chiusura di una manutenzione e la consegna di un acquisto.
 *
 * `CentroCostoLookupId` è il campo che conta ed è **copiato qui**, non
 * ricavato risalendo alla struttura: se domani una struttura passa a un altro
 * centro di costo, i movimenti già registrati non si devono spostare da soli.
 * `StrutturaLookupId` è facoltativo — i servizi senza sede fisica registrano
 * costi che non stanno in nessun edificio.
 */
export async function creaCosto(fields: {
  Title: string
  DataCosto: string
  Categoria: string             // Choice → stringa semplice
  Importo: number
  CentroCostoLookupId?: number  // Lookup → {Campo}LookupId
  StrutturaLookupId?: number    // Lookup → {Campo}LookupId
  Fornitore?: string
  Periodo?: string
  Fonte?: string                // Choice → stringa semplice
}): Promise<void> {
  // Graph rifiuta le proprietà undefined: vanno tolte prima di spedire.
  const puliti = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  )
  await graphPost(`${listBase('costi')}`, { fields: puliti })
}

// Campi da leggere dalla lista Costi Strutture.
// Struttura e CentroCosto sono lookup → { Value, LookupId } (oppure stringa
// semplice via fields-expansion)
const COSTO_FIELDS =
  'id,fields&$expand=fields($select=Title,DataCosto,Categoria,Importo,Struttura,StrutturaLookupId,CentroCosto,CentroCostoLookupId,Fornitore,Periodo,Fonte,Note)'

function mapCosto(item: any): CostoRecord {
  const f = item.fields
  return {
    id: Number(item.id),
    title: f.Title ?? '',
    dataCosto: f.DataCosto ?? '',
    categoria: lookupValue(f.Categoria) || 'Non categorizzato',
    importo: typeof f.Importo === 'number' ? f.Importo : Number(f.Importo ?? 0),
    struttura: {
      id: Number(f.Struttura?.LookupId ?? f.StrutturaLookupId ?? 0),
      value: lookupValue(f.Struttura),
    },
    centroCosto: Number(f.CentroCosto?.LookupId ?? f.CentroCostoLookupId ?? 0)
      ? {
          id: Number(f.CentroCosto?.LookupId ?? f.CentroCostoLookupId),
          value: lookupValue(f.CentroCosto),
        }
      : undefined,
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
 * Inserisce un costo senza passare da una richiesta di manutenzione.
 * Fonte = "Diretto".
 *
 * Il centro di costo è obbligatorio, la struttura no: un corso di formazione
 * dell'educativa nelle scuole è un costo vero che non sta in nessun edificio.
 */
export async function creaCostoDiretto(fields: {
  CentroCostoLookupId: number
  StrutturaLookupId?: number
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
    CentroCostoLookupId: fields.CentroCostoLookupId,
    StrutturaLookupId: fields.StrutturaLookupId || undefined,
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
