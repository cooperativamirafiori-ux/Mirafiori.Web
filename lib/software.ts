/**
 * CRUD sulla SharePoint List "Gestione Software" via Microsoft Graph + upload
 * delle fatture nella document library del sito.
 *
 * Convenzioni SP (vedi lib/sharepoint.ts):
 *   - Title = nome del servizio
 *   - Choice columns (Categoria, Periodicita, Stato) si leggono/scrivono come stringhe
 *   - Boolean columns (RinnovoAutomatico) come true/false
 *   - Date "solo giorno" (Scadenza) scritte a mezzogiorno UTC per non scavallare
 *     la mezzanotte in nessun fuso (stesso accorgimento di lib/prestazioni.ts)
 *
 * GUID lista in env: SP_LIST_SOFTWARE (creato da scripts/provision-software.mjs)
 */

import {
  graphGet,
  graphGetOrNull,
  graphPost,
  graphPatch,
  graphDelete,
  graphPutBinary,
} from '@/lib/graph'
import type { Software } from '@/types/software'
import {
  parseEmails,
  buildEventoScadenza,
  creaEvento,
  aggiornaEvento,
  eliminaEvento,
} from '@/lib/calendar'

const SITE = () => process.env.SHAREPOINT_SITE_ID!
const LIST = () => process.env.SP_LIST_SOFTWARE!
const listBase = () => `/sites/${SITE()}/lists/${LIST()}/items`

const PREFER_NON_INDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

// Cartella della document library dove archiviare le fatture
const FATTURE_FOLDER = 'Gestione Software'

const SOFTWARE_FIELDS =
  'id,fields&$expand=fields($select=Title,Categoria,Account,Password,LinkPortale,Referente,Costo,Periodicita,RinnovoAutomatico,Scadenza,CartaPagamento,Stato,FatturaUrl,FatturaNome,Note,CalendarEmails,CalendarEventi)'

function parseEventiJson(raw: unknown): Record<string, string> {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? (obj as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function soloData(d?: string): string {
  return (d ?? '').slice(0, 10)
}

/** Date "solo giorno": scrivi a mezzogiorno UTC per non perdere un giorno tra i fusi */
function toGraphDateOnly(d?: string | null): string | null {
  if (!d) return null
  const giorno = d.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(giorno) ? `${giorno}T12:00:00Z` : null
}

function mapSoftware(item: any): Software {
  const f = item.fields ?? {}
  return {
    spItemId: item.id,
    servizio: f.Title ?? '',
    categoria: f.Categoria ?? '',
    account: f.Account ?? '',
    password: f.Password ?? '',
    linkPortale: f.LinkPortale ?? '',
    referente: f.Referente ?? '',
    costo: typeof f.Costo === 'number' ? f.Costo : undefined,
    periodicita: f.Periodicita ?? '',
    rinnovoAutomatico: f.RinnovoAutomatico ?? false,
    scadenza: soloData(f.Scadenza) || undefined,
    cartaPagamento: f.CartaPagamento ?? '',
    stato: f.Stato ?? 'Attivo',
    fatturaUrl: f.FatturaUrl ?? '',
    fatturaNome: f.FatturaNome ?? '',
    note: f.Note ?? '',
    calendarEmails: f.CalendarEmails ?? '',
    calendarEventi: parseEventiJson(f.CalendarEventi),
  }
}

// ============================================================
// Lettura
// ============================================================

/** Tutti i software, ordinati per scadenza crescente (i più imminenti in cima) */
export async function getSoftware(): Promise<Software[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase()}?$select=${SOFTWARE_FIELDS}&$orderby=fields/Scadenza asc&$top=500`,
    PREFER_NON_INDEXED,
  )
  return res.value.map(mapSoftware)
}

/** Singolo software per ID riga SP */
export async function getSoftwareById(spItemId: string): Promise<Software> {
  const item = await graphGet<any>(
    `/sites/${SITE()}/lists/${LIST()}/items/${spItemId}?$select=${SOFTWARE_FIELDS}`,
  )
  return mapSoftware(item)
}

// ============================================================
// Scrittura
// ============================================================

/** Campi SP costruiti dall'input del form */
function buildFields(input: {
  servizio: string
  categoria: string
  account: string
  password: string
  linkPortale: string
  referente: string
  costo?: number | null
  periodicita: string
  rinnovoAutomatico: boolean
  scadenza?: string | null
  cartaPagamento: string
  stato: string
  note: string
  calendarEmails: string
}): Record<string, unknown> {
  return {
    Title: input.servizio,
    Categoria: input.categoria || null,
    Account: input.account || null,
    Password: input.password || null,
    LinkPortale: input.linkPortale || null,
    Referente: input.referente || null,
    Costo: typeof input.costo === 'number' ? input.costo : null,
    Periodicita: input.periodicita || null,
    RinnovoAutomatico: !!input.rinnovoAutomatico,
    Scadenza: toGraphDateOnly(input.scadenza),
    CartaPagamento: input.cartaPagamento || null,
    Stato: input.stato || 'Attivo',
    Note: input.note || null,
    // Normalizza la lista email (lowercase, valide, dedup)
    CalendarEmails: parseEmails(input.calendarEmails).join(', ') || null,
  }
}

export async function creaSoftware(input: Parameters<typeof buildFields>[0]): Promise<Software> {
  const res = await graphPost<any>(listBase(), { fields: buildFields(input) })
  await sincronizzaCalendario(res.id)
  return getSoftwareById(res.id)
}

export async function aggiornaSoftware(
  spItemId: string,
  input: Parameters<typeof buildFields>[0],
): Promise<Software> {
  await graphPatch(
    `/sites/${SITE()}/lists/${LIST()}/items/${spItemId}/fields`,
    buildFields(input),
  )
  await sincronizzaCalendario(spItemId)
  return getSoftwareById(spItemId)
}

/**
 * Allinea gli eventi di scadenza sui calendari Outlook indicati in CalendarEmails:
 * crea quelli mancanti, aggiorna gli esistenti, cancella quelli non più richiesti
 * (calendario rimosso o scadenza azzerata). Salva la mappa email→eventId in
 * CalendarEventi. Best-effort: se Calendars.ReadWrite non è ancora concesso o una
 * casella non è raggiungibile, NON blocca il salvataggio del software.
 */
export async function sincronizzaCalendario(spItemId: string): Promise<void> {
  let sw: Software
  try {
    sw = await getSoftwareById(spItemId)
  } catch (e) {
    console.error('[software] sincronizzaCalendario: lettura item fallita', e)
    return
  }

  const esistenti = { ...sw.calendarEventi } // email → eventId già creati
  // Se manca la scadenza, niente eventi: cancella tutti quelli esistenti.
  const desiderate = sw.scadenza ? parseEmails(sw.calendarEmails) : []

  const payload = sw.scadenza
    ? buildEventoScadenza({
        servizio: sw.servizio,
        scadenza: sw.scadenza,
        costo: sw.costo,
        periodicita: sw.periodicita,
        referente: sw.referente,
        cartaPagamento: sw.cartaPagamento,
        rinnovoAutomatico: sw.rinnovoAutomatico,
      })
    : null

  const nuovaMappa: Record<string, string> = {}

  // Crea/aggiorna sui calendari desiderati
  for (const email of desiderate) {
    try {
      if (esistenti[email]) {
        await aggiornaEvento(email, esistenti[email], payload!)
        nuovaMappa[email] = esistenti[email]
      } else {
        nuovaMappa[email] = await creaEvento(email, payload!)
      }
    } catch (e) {
      console.error(`[software] evento calendario fallito per ${email}`, e)
    }
  }

  // Cancella gli eventi sui calendari non più desiderati
  for (const [email, eventId] of Object.entries(esistenti)) {
    if (desiderate.includes(email)) continue
    try {
      await eliminaEvento(email, eventId)
    } catch (e) {
      console.error(`[software] cancellazione evento fallita per ${email}`, e)
    }
  }

  // Persisti la mappa aggiornata solo se è cambiata
  const primaJson = JSON.stringify(esistenti)
  const dopoJson = JSON.stringify(nuovaMappa)
  if (primaJson !== dopoJson) {
    try {
      await patchSoftwareFields(spItemId, { CalendarEventi: dopoJson === '{}' ? '' : dopoJson })
    } catch (e) {
      console.error('[software] salvataggio mappa eventi fallito', e)
    }
  }
}

/** Aggiorna campi arbitrari (usato per fattura e mappa eventi calendario) */
export async function patchSoftwareFields(
  spItemId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await graphPatch(`/sites/${SITE()}/lists/${LIST()}/items/${spItemId}/fields`, fields)
}

export async function eliminaSoftware(spItemId: string): Promise<void> {
  // Cancella prima gli eventi calendario collegati (best-effort)
  try {
    const sw = await getSoftwareById(spItemId)
    for (const [email, eventId] of Object.entries(sw.calendarEventi)) {
      try {
        await eliminaEvento(email, eventId)
      } catch (e) {
        console.error(`[software] cancellazione evento (elimina) fallita per ${email}`, e)
      }
    }
  } catch {
    // se non leggibile, procedi comunque con l'eliminazione dell'item
  }
  await graphDelete(`${listBase()}/${spItemId}`)
}

// ============================================================
// Fattura (upload su document library)
// ============================================================

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function sanitizeFileName(s: string): string {
  return (s || 'fattura')
    .replace(/[\\/:*?"<>|#%]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

let _driveIdCache: string | null = null
async function getDriveId(): Promise<string> {
  if (process.env.SP_SOFTWARE_DRIVE_ID) return process.env.SP_SOFTWARE_DRIVE_ID
  if (_driveIdCache) return _driveIdCache
  const d = await graphGet<{ id: string }>(`/sites/${SITE()}/drive?$select=id`)
  _driveIdCache = d.id
  return d.id
}

/** Crea la cartella "Gestione Software" se manca, ritorna il suo path */
async function ensureFattureFolder(driveId: string): Promise<string> {
  const existing = await graphGetOrNull<{ id: string }>(
    `/drives/${driveId}/root:/${encodePath(FATTURE_FOLDER)}?$select=id`,
  )
  if (!existing) {
    await graphPost(`/drives/${driveId}/root/children`, {
      name: FATTURE_FOLDER,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename',
    })
  }
  return FATTURE_FOLDER
}

/**
 * Carica la fattura (< 4 MB) nella cartella "Gestione Software" e aggiorna
 * la riga SP con URL e nome file. Ritorna il software aggiornato.
 */
export async function caricaFattura(
  spItemId: string,
  servizio: string,
  filename: string,
  data: ArrayBuffer | Uint8Array,
  contentType?: string,
): Promise<Software> {
  const driveId = await getDriveId()
  const folder = await ensureFattureFolder(driveId)
  // Nome file: <servizio>_<originale> per ritrovarla facilmente
  const safe = sanitizeFileName(`${servizio}_${filename}`)
  const res = await graphPutBinary<{ webUrl: string; name: string }>(
    `/drives/${driveId}/root:/${encodePath(`${folder}/${safe}`)}:/content`,
    data,
    contentType,
  )
  await patchSoftwareFields(spItemId, {
    FatturaUrl: res.webUrl,
    FatturaNome: res.name ?? safe,
  })
  return getSoftwareById(spItemId)
}
