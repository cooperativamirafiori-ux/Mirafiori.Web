/**
 * Anagrafica strutture e tecnici: dati di base condivisi fra manutenzioni,
 * costi, acquisti e timbrature.
 */

import { graphGet } from '@/lib/core/graph'
import { listBase } from '@/lib/core/sp'
import type { Struttura, Tecnico } from '@/types/manutenzioni'

export async function getStrutture(): Promise<Struttura[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase('strutture')}?$select=id,fields&$expand=fields($select=Title,Codice,StrutturaLabel,Responsabile,ResponsabilePulizie)&$orderby=fields/Codice asc`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }
  )
  return res.value.map((item) => ({
    id: Number(item.id),  // item.id = Graph item ID = SP internal ID
    title: item.fields.Title,
    codice: item.fields.Codice,
    strutturaLabel: item.fields.StrutturaLabel,
    responsabileEmail: item.fields.Responsabile?.Email ?? '',
    responsabilePulizieEmail: item.fields.ResponsabilePulizie?.Email ?? '',
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
