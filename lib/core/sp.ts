/**
 * Accesso alle SharePoint Lists via Graph: base comune a tutte le aree.
 *
 * Qui sta solo l'impianto — indirizzi delle liste, helper di lettura dei campi,
 * utenti SP, parametri di configurazione. La logica di dominio sta nei moduli
 * delle aree (lib/manutenzioni, lib/costi, …).
 *
 * Nota sui campi SP:
 *   - le colonne choice si scrivono come { Value: "..." }
 *   - le colonne lookup si scrivono come NomeCampoId: <number>
 *   - i campi lookup e persona in lettura arrivano come stringa → lookupValue()
 */

import { graphGet, graphGetOrNull, graphPost } from '@/lib/core/graph'

export const SITE = () => process.env.SHAREPOINT_SITE_ID!

export const LIST = (key: string) => {
  const map: Record<string, string> = {
    strutture:  process.env.SP_LIST_STRUTTURE!,
    tecnici:    process.env.SP_LIST_TECNICI!,
    richieste:  process.env.SP_LIST_RICHIESTE!,
    costi:      process.env.SP_LIST_COSTI!,
    parametri:  process.env.SP_LIST_PARAMETRI!,
    admin:      process.env.SP_LIST_ADMIN!,
    autorizzazioni: process.env.SP_LIST_AUTORIZZAZIONI!,
  }
  return map[key]
}

export const listBase = (list: string) =>
  `/sites/${SITE()}/lists/${LIST(list)}/items`

// Header richiesto da Graph per filtrare/ordinare su colonne non indicizzate.
// Le liste permessi sono piccole, quindi l'avviso "MayFailRandomly" non è un problema.
export const PREFER_NON_INDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

// ============================================================
// Anagrafica Strutture
// ============================================================

// Lookup/Person column: via Graph fields-expansion può tornare come stringa semplice
// (display value) oppure come oggetto { Value/LookupValue/DisplayName }. Gestiamo entrambi.
export function lookupValue(field: any): string {
  if (field == null) return ''
  if (typeof field === 'string') return field
  return field.Value ?? field.LookupValue ?? field.DisplayName ?? ''
}

// "Elenco informazioni utente" (User Information List) — GUID fisso del sito
export const SP_USER_INFO_LIST = '3f6b4698-931e-4540-a681-d6a436b26bdb'

/** Recupera l'email SP da un lookup ID (inverso di getSPUserLookupId) */

export async function getSPUserEmailByLookupId(lookupId: number | string): Promise<string> {
  const id = Number(lookupId)
  if (!id) return ''
  const res = await graphGet<any>(
    `/sites/${SITE()}/lists/${SP_USER_INFO_LIST}/items/${id}?$expand=fields`
  )
  const email = res?.fields?.EMail ?? res?.fields?.UserName ?? ''
  if (!email) console.warn('[SP] getSPUserEmailByLookupId: nessuna email per lookupId', id, JSON.stringify(res?.fields))
  return email
}

async function cercaInUserInfoList(email: string): Promise<number> {
  const filter = encodeURIComponent(`fields/EMail eq '${email.replace(/'/g, "''")}'`)
  const res = await graphGet<{ value: any[] }>(
    `/sites/${SITE()}/lists/${SP_USER_INFO_LIST}/items?$select=id,fields&$expand=fields($select=id,EMail)&$filter=${filter}&$top=1`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }
  )
  return res.value.length ? Number(res.value[0].fields.id) : 0
}

/**
 * Cartella vuota del sito usata solo per "far conoscere" una persona a SharePoint.
 * Una persona entra nella User Information List solo quando ha un accesso al
 * sito: chi non ci ha mai messo piede (es. un educatore nuovo) non c'è, e ogni
 * colonna Persona fallisce con "Utente SP non trovato". Graph non ha ensureUser:
 * un invito in sola lettura, senza mail, su questa cartella ottiene lo stesso effetto.
 */
const CARTELLA_REGISTRAZIONE = '_registrazione-utenti-app'

async function registraSulSito(email: string): Promise<void> {
  const base = `/sites/${SITE()}/drive`
  let cartella = await graphGetOrNull<{ id: string }>(`${base}/root:/${CARTELLA_REGISTRAZIONE}`)
  if (!cartella) {
    try {
      cartella = await graphPost<{ id: string }>(`${base}/root/children`, {
        name: CARTELLA_REGISTRAZIONE,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      })
    } catch {
      // creata nel frattempo da un'altra richiesta
      cartella = await graphGet<{ id: string }>(`${base}/root:/${CARTELLA_REGISTRAZIONE}`)
    }
  }
  await graphPost(`${base}/items/${cartella.id}/invite`, {
    recipients: [{ email }],
    roles: ['read'],
    requireSignIn: true,
    sendInvitation: false,
  })
}

export async function getSPUserLookupId(email: string): Promise<number> {
  const trovato = await cercaInUserInfoList(email)
  if (trovato) return trovato

  // Non ancora nota al sito: la si registra e si riprova (la voce compare in pochi secondi).
  try {
    await registraSulSito(email)
  } catch (err) {
    console.error('[SP] registrazione utente sul sito fallita', email, err)
    throw new Error(`Utente SP non trovato: ${email}`)
  }
  for (const attesa of [1000, 2000, 3000]) {
    await new Promise((r) => setTimeout(r, attesa))
    const id = await cercaInUserInfoList(email)
    if (id) return id
  }
  throw new Error(`Utente SP non trovato: ${email}`)
}

/** Crea nuova richiesta — ritorna l'item appena creato */

export async function getParametro(chiave: string): Promise<number> {
  // Recupera tutti i parametri e filtra client-side (lista piccola, case-insensitive)
  const res = await graphGet<{ value: any[] }>(
    `${listBase('parametri')}?$select=id,fields&$expand=fields&$top=100`
  )
  const chiaveLower = chiave.toLowerCase()
  const item = res.value.find(
    (i) => (i.fields?.Title ?? '').toLowerCase() === chiaveLower
  )
  if (!item) throw new Error(`Parametro '${chiave}' non trovato nella lista`)
  const valore = item.fields?.Valore
  if (valore == null) throw new Error(`Parametro '${chiave}' trovato ma campo Valore nullo`)
  return Number(valore)
}

// ============================================================
// Costi Strutture
// ============================================================
