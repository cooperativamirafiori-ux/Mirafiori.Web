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

import { unstable_cache } from 'next/cache'
import { graphGet } from '@/lib/core/graph'
import { PREFER_NON_INDEXED, getSPUserEmailByLookupId } from '@/lib/core/sp'

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

// ============================================================
// Coordinatori
// ============================================================
//
// Su SharePoint la colonna ha nome interno `Responsabile` (quello non si
// cambia) e nome visibile "Coordinatori": in cooperativa si chiamano così.
// Accetta più persone — un coordinatore e un vice.
//
// È la fonte dell'accesso ai conti Qonto del servizio: chi è coordinatore di
// un centro di costo ne vede il conto, senza un permesso da assegnare a parte.
// Cambiare il coordinatore qui sposta l'accesso da solo.

type MappaCoordinatori = Record<string, string[]>

/**
 * Le email di una colonna persona, singola o multipla.
 *
 * Graph non è coerente: per una persona singola dà solo `<Nome>LookupId`, per
 * una multipla un array di oggetti che *di solito* portano l'`Email`. Si prende
 * l'email quando c'è e si risolve il LookupId sull'elenco utenti quando manca.
 */
async function emailDaPersona(fields: any, nome: string): Promise<string[]> {
  const valore = fields?.[nome]
  const ids = fields?.[`${nome}LookupId`]
  const voci: Array<{ email?: string; id?: number }> = []
  if (Array.isArray(valore)) {
    for (const v of valore) voci.push({ email: v?.Email ?? v?.EMail, id: Number(v?.LookupId) || undefined })
  } else if (valore && typeof valore === 'object') {
    voci.push({ email: valore.Email ?? valore.EMail, id: Number(valore.LookupId) || undefined })
  }
  if (!voci.length && ids != null) {
    for (const id of Array.isArray(ids) ? ids : [ids]) voci.push({ id: Number(id) || undefined })
  }
  const email = await Promise.all(
    voci.map(async (v) => v.email || (v.id ? await getSPUserEmailByLookupId(v.id).catch(() => '') : '')),
  )
  return email.map((e) => e.trim().toLowerCase()).filter(Boolean)
}

async function leggiCoordinatori(): Promise<MappaCoordinatori> {
  const site = process.env.SHAREPOINT_SITE_ID
  const lista = LISTA()
  if (!site || !lista) return {}
  const res = await graphGet<{ value: any[] }>(
    `/sites/${site}/lists/${lista}/items?$select=id&$expand=fields($select=Codice,Attivo,Responsabile)&$top=500`,
    PREFER_NON_INDEXED,
  )
  const mappa: MappaCoordinatori = {}
  for (const i of res.value ?? []) {
    const codice = String(i.fields?.Codice ?? '').trim().toLowerCase()
    if (!codice || i.fields?.Attivo === false) continue
    const email = await emailDaPersona(i.fields, 'Responsabile')
    if (email.length) mappa[codice] = email
  }
  return mappa
}

/**
 * Codice del centro di costo → email dei coordinatori.
 * In cache 5 minuti: la leggono la home e la sezione Controllo di Gestione a
 * ogni apertura, e un coordinatore nominato adesso può aspettare cinque minuti.
 * Non lancia mai: in caso di guaio nessuno risulta coordinatore (si chiude,
 * non si apre).
 */
export const getCoordinatoriCentri = unstable_cache(
  async (): Promise<MappaCoordinatori> => {
    try {
      return await leggiCoordinatori()
    } catch (err) {
      console.error('[centri-costo] lettura coordinatori fallita:', err)
      return {}
    }
  },
  ['centri-costo-coordinatori'],
  { revalidate: 300, tags: ['centri-costo'] },
)

/** Codici (cc1…cc23) dei centri di costo di cui `email` è coordinatore. */
export async function getCentriCoordinati(email: string | null | undefined): Promise<string[]> {
  const e = (email ?? '').trim().toLowerCase()
  if (!e) return []
  const mappa = await getCoordinatoriCentri()
  return Object.entries(mappa)
    .filter(([, emails]) => emails.includes(e))
    .map(([codice]) => codice)
}
