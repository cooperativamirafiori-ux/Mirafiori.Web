/**
 * Anagrafica strutture e tecnici: dati di base condivisi fra manutenzioni,
 * costi, acquisti e timbrature.
 */

import { graphGet, graphGetAll } from '@/lib/core/graph'
import { listBase, lookupValue } from '@/lib/core/sp'
import type { Struttura, Tecnico } from '@/types/manutenzioni'

export async function getStrutture(): Promise<Struttura[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase('strutture')}?$select=id,fields&$expand=fields($select=Title,Codice,StrutturaLabel,Responsabile,ResponsabilePulizie,CentroCosto,CentroCostoLookupId)&$orderby=fields/Codice asc`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }
  )
  return res.value.map((item) => {
    const ccId = Number(item.fields.CentroCosto?.LookupId ?? item.fields.CentroCostoLookupId ?? 0)
    return {
      id: Number(item.id),  // item.id = Graph item ID = SP internal ID
      title: item.fields.Title,
      codice: item.fields.Codice,
      strutturaLabel: item.fields.StrutturaLabel,
      // ⚠️ Arrivano vuote, ed è normale: Graph, espandendo `fields`, per una
      // colonna persona non restituisce l'email ma solo `<Nome>LookupId`.
      // L'email va risolta sull'elenco informazioni utente
      // (getSPUserEmailByLookupId in lib/core/sp.ts) — lo fa
      // scripts/seed-permessi-manutenzioni.mjs. Nessuno oggi usa questi due
      // campi: chi li usasse dando per buona l'email avrebbe una stringa vuota.
      responsabileEmail: item.fields.Responsabile?.Email ?? '',
      responsabilePulizieEmail: item.fields.ResponsabilePulizie?.Email ?? '',
      centroCosto: ccId
        ? { id: ccId, value: lookupValue(item.fields.CentroCosto) }
        : undefined,
    }
  })
}

/**
 * Centro di costo di default di una struttura, per precompilare i documenti
 * che nascono da un flusso automatico (chiusura manutenzione, consegna
 * acquisto) dove nessuno lo sceglie a mano.
 *
 * Ritorna `undefined` se la struttura non esiste o non ha ancora un centro di
 * costo assegnato: chi chiama decide se è un problema.
 */
export async function centroCostoDiStruttura(
  strutturaId: number,
): Promise<number | undefined> {
  if (!strutturaId) return undefined
  try {
    const strutture = await getStrutture()
    return strutture.find((s) => s.id === strutturaId)?.centroCosto?.id
  } catch (err) {
    console.error('[strutture] centroCostoDiStruttura fallita:', err)
    return undefined
  }
}

/** Una struttura con il suo indirizzo, per dire al tecnico dove andare. */
export interface StrutturaConIndirizzo {
  id: number
  title: string
  codice: string
  indirizzo: string
  comune: string
}

/**
 * Strutture con indirizzo e comune. Si legge `fields` intero, senza $select:
 * `Comune` esiste solo dove l'ha creata scripts/aggiungi-struttura.mjs, e una
 * colonna che manca in un $select fa fallire tutta la lettura.
 */
export async function getStruttureConIndirizzo(): Promise<StrutturaConIndirizzo[]> {
  const voci = await graphGetAll<any>(
    `${listBase('strutture')}?$expand=fields&$top=500`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
  )
  return voci.map((item) => ({
    id: Number(item.id),
    title: item.fields?.Title ?? '',
    codice: item.fields?.Codice ?? '',
    indirizzo: typeof item.fields?.Indirizzo === 'string' ? item.fields.Indirizzo.trim() : '',
    comune: typeof item.fields?.Comune === 'string' ? item.fields.Comune.trim() : '',
  }))
}

// ============================================================
// Anagrafica Tecnici
// ============================================================

export async function getTecnici(): Promise<Tecnico[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase('tecnici')}?$select=id,fields&$expand=fields($select=Title,Telefono,Specializzazione,Ditta,Email)&$orderby=fields/Title asc`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }
  )
  return res.value.map((item) => ({
    id: Number(item.id),  // item.id = Graph item ID = SP internal ID
    title: item.fields.Title,
    telefono: item.fields.Telefono ?? '',
    specializzazione: item.fields.Specializzazione ?? '',
    ditta: item.fields.Ditta ?? '',
    email: item.fields.Email ?? '',
  }))
}

// ============================================================
// Richieste Manutenzione
// ============================================================
