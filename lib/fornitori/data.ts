/**
 * Anagrafica Fornitori sulla lista SharePoint dei Tecnici (`SP_LIST_TECNICI`).
 * Vedi types/fornitori.ts per il perché della lista condivisa.
 *
 * La lettura espande `fields` senza `$select`: così la pagina si apre anche se
 * le colonne nuove non ci sono ancora (prima di provision-fornitori.mjs).
 */

import { graphGet, graphGetAll, graphPatch, graphPost } from '@/lib/core/graph'
import { PREFER_NON_INDEXED, listBase, SITE, LIST } from '@/lib/core/sp'
import type { DatiFornitore, Fornitore } from '@/types/fornitori'

const s = (v: unknown) => (v == null ? '' : String(v).trim())

export async function getFornitori(): Promise<Fornitore[]> {
  const voci = await graphGetAll<any>(
    `${listBase('tecnici')}?$select=id&$expand=fields&$top=999`,
    PREFER_NON_INDEXED,
  )
  return voci
    .map((i) => {
      const f = i.fields ?? {}
      return {
        id: Number(i.id),
        nome: s(f.Title),
        ditta: s(f.Ditta),
        specializzazione: s(f.Specializzazione),
        telefono: s(f.Telefono),
        email: s(f.Email),
        partitaIva: s(f.PartitaIva),
        pec: s(f.Pec),
        indirizzo: s(f.Indirizzo),
        note: s(f.Note),
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
}

/**
 * Scelte della colonna Specializzazione, se su SharePoint è un Choice.
 * Ritorna `null` se è testo libero: allora il modulo propone i valori già usati.
 */
export async function sceltaSpecializzazione(): Promise<string[] | null> {
  try {
    const r = await graphGet<{ value: any[] }>(
      `/sites/${SITE()}/lists/${LIST('tecnici')}/columns?$select=name,choice`,
    )
    const col = r.value.find((c) => c.name === 'Specializzazione')
    return col?.choice?.choices?.length ? (col.choice.choices as string[]) : null
  } catch {
    return null
  }
}

const campi = (d: DatiFornitore) => ({
  Title: d.nome,
  Ditta: d.ditta || null,
  Specializzazione: d.specializzazione || null,
  Telefono: d.telefono || null,
  Email: d.email || null,
  PartitaIva: d.partitaIva || null,
  Pec: d.pec || null,
  Indirizzo: d.indirizzo || null,
  Note: d.note || null,
})

/** Nome già presente (maiuscole e spazi non contano)? Serve a non creare doppioni. */
async function doppione(nome: string, escludiId?: number): Promise<Fornitore | undefined> {
  const n = nome.trim().toLowerCase()
  return (await getFornitori()).find((f) => f.id !== escludiId && f.nome.toLowerCase() === n)
}

export async function creaFornitore(d: DatiFornitore): Promise<number> {
  if (await doppione(d.nome)) throw new Error(`Esiste già un fornitore chiamato "${d.nome}": modifica quello`)
  const r = await graphPost<{ id: string }>(listBase('tecnici'), { fields: campi(d) })
  return Number(r.id)
}

export async function aggiornaFornitore(id: number, d: DatiFornitore): Promise<void> {
  if (await doppione(d.nome, id)) throw new Error(`Esiste già un altro fornitore chiamato "${d.nome}"`)
  await graphPatch(`${listBase('tecnici')}/${id}/fields`, campi(d))
}
