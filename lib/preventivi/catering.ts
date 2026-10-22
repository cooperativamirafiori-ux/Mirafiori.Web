/**
 * Preventivi Catering — i parametri sulla lista SharePoint "Parametri"
 * (la stessa di "Costo orario pulizie" e "SogliaApprovazionePagamenti").
 *
 * Quattro righe, Title = chiave, Valore = numero. Se una riga non c'è si usa
 * il valore del foglio Excel e la si crea al primo salvataggio: nessuno script
 * da lanciare prima.
 */

import { graphGet, graphPatch, graphPost } from '@/lib/core/graph'
import { LIST, listBase } from '@/lib/core/sp'
import { PARAMETRI_CATERING_PREDEFINITI, type ParametriCatering } from './catering-calcoli'

export const CHIAVI_CATERING: Record<keyof ParametriCatering, string> = {
  costoKm: 'Catering - Costo km',
  costoOraPersonale: 'Catering - Costo orario personale',
  costoCoperto: 'Catering - Costo coperto',
  ricaricoPercento: 'Catering - Ricarico %',
  ivaPercento: 'Catering - IVA %',
}

type RigaParametro = { id: string; fields?: { Title?: string; Valore?: unknown } }

async function righeParametri(): Promise<RigaParametro[]> {
  const res = await graphGet<{ value: RigaParametro[] }>(`${listBase('parametri')}?$select=id,fields&$expand=fields&$top=200`)
  return res.value ?? []
}

const trova = (righe: RigaParametro[], chiave: string) =>
  righe.find((r) => (r.fields?.Title ?? '').trim().toLowerCase() === chiave.toLowerCase())

export interface LetturaParametri {
  parametri: ParametriCatering
  /** Le chiavi ancora senza riga su SharePoint (valgono i predefiniti). */
  mancanti: (keyof ParametriCatering)[]
  /** Se la lista non risponde: si lavora coi predefiniti e lo si dice. */
  avviso?: string
}

export async function leggiParametriCateringSP(): Promise<LetturaParametri> {
  const parametri = { ...PARAMETRI_CATERING_PREDEFINITI }
  const chiavi = Object.keys(CHIAVI_CATERING) as (keyof ParametriCatering)[]
  if (!LIST('parametri')) {
    return { parametri, mancanti: chiavi, avviso: 'Lista Parametri non configurata: valgono i valori del foglio Excel.' }
  }
  try {
    const righe = await righeParametri()
    const mancanti: (keyof ParametriCatering)[] = []
    for (const k of chiavi) {
      const v = Number(trova(righe, CHIAVI_CATERING[k])?.fields?.Valore)
      if (trova(righe, CHIAVI_CATERING[k]) && Number.isFinite(v)) parametri[k] = v
      else mancanti.push(k)
    }
    return { parametri, mancanti }
  } catch (e) {
    console.error('[catering] lettura parametri', e)
    return {
      parametri,
      mancanti: chiavi,
      avviso: 'Non riesco a leggere i parametri da SharePoint: per ora valgono i valori del foglio Excel.',
    }
  }
}

/** Scrive i quattro parametri: aggiorna le righe che ci sono, crea quelle che mancano. */
export async function salvaParametriCateringSP(nuovi: ParametriCatering): Promise<ParametriCatering> {
  if (!LIST('parametri')) throw Object.assign(new Error('Lista Parametri non configurata'), { stato: 503 })
  const righe = await righeParametri()
  for (const k of Object.keys(CHIAVI_CATERING) as (keyof ParametriCatering)[]) {
    const riga = trova(righe, CHIAVI_CATERING[k])
    if (riga) {
      if (Number(riga.fields?.Valore) !== nuovi[k]) {
        await graphPatch(`${listBase('parametri')}/${riga.id}/fields`, { Valore: nuovi[k] })
      }
    } else {
      await graphPost(listBase('parametri'), { fields: { Title: CHIAVI_CATERING[k], Valore: nuovi[k] } })
    }
  }
  return nuovi
}
