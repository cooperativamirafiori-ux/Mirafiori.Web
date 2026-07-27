/**
 * CRUD generico sulle liste SharePoint dell'area Risorse Umane
 * (Dipendenti — che include anche i Collaboratori, distinti dal campo
 * CategoriaRU — e Tirocini) via Microsoft Graph, guidato dallo schema in
 * types/risorse-umane.ts.
 *
 * Gestione anche della "cartella personale" del dipendente nella document
 * library del sito (creata al primo accesso), con upload/elenco documenti.
 *
 * GUID liste in env: SP_LIST_DIPENDENTI / SP_LIST_TIROCINI
 * (creati da scripts/provision-risorse-umane.mjs)
 */

import {
  graphGet,
  graphGetOrNull,
  graphPost,
  graphPatch,
  graphDelete,
  graphPutBinary,
} from '@/lib/graph'
import {
  RU_CONFIG,
  type RUEntity,
  type RUField,
  type RURecord,
} from '@/types/risorse-umane'

const SITE = () => process.env.SHAREPOINT_SITE_ID!

const LIST_ENV: Record<RUEntity, () => string | undefined> = {
  dipendenti: () => process.env.SP_LIST_DIPENDENTI,
  tirocini: () => process.env.SP_LIST_TIROCINI,
}

function listId(entity: RUEntity): string {
  const id = LIST_ENV[entity]()
  if (!id) throw new Error(`Lista SharePoint non configurata per "${entity}" (imposta ${entity === 'dipendenti' ? 'SP_LIST_DIPENDENTI' : 'SP_LIST_TIROCINI'})`)
  return id
}

const listBase = (entity: RUEntity) => `/sites/${SITE()}/lists/${listId(entity)}/items`

const PREFER_NON_INDEXED = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }

// ------------------------------------------------------------------
// Helper conversione
// ------------------------------------------------------------------
/** Date "solo giorno": scritte a mezzogiorno UTC per non scavallare i fusi */
function toGraphDateOnly(d?: unknown): string | null {
  if (d == null || d === '') return null
  const giorno = String(d).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(giorno) ? `${giorno}T12:00:00Z` : null
}

function soloData(d?: unknown): string | null {
  if (d == null) return null
  const s = String(d).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function extraKeys(entity: RUEntity): string[] {
  return entity === 'dipendenti' ? ['CartellaUrl'] : []
}

function selectFields(entity: RUEntity): string {
  const keys = RU_CONFIG[entity].fields.map((f) => f.key)
  const all = ['Title', 'IdAccess', ...keys, ...extraKeys(entity)]
  return `id,fields&$expand=fields($select=${all.join(',')})`
}

function mapItem(entity: RUEntity, item: any): RURecord {
  const f = item.fields ?? {}
  const rec: RURecord = { spItemId: item.id }
  rec.IdAccess = f.IdAccess ?? null
  rec.Title = f.Title ?? null
  for (const field of RU_CONFIG[entity].fields) {
    const raw = f[field.key]
    if (field.type === 'date') rec[field.key] = soloData(raw)
    else if (field.type === 'number' || field.type === 'currency') rec[field.key] = raw ?? null
    else rec[field.key] = raw ?? null
  }
  for (const k of extraKeys(entity)) rec[k] = f[k] ?? null
  return rec
}

/** Costruisce i campi SP dal payload del form, secondo lo schema. */
function buildFields(entity: RUEntity, input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of RU_CONFIG[entity].fields) {
    const v = input[field.key]
    switch (field.type) {
      case 'date':
        out[field.key] = toGraphDateOnly(v)
        break
      case 'number':
      case 'currency':
        out[field.key] = toNumber(v)
        break
      default: {
        const s = typeof v === 'string' ? v.trim() : v
        out[field.key] = s === undefined || s === '' ? null : s
      }
    }
  }
  // Title obbligatorio in SP: "Cognome Nome"
  const cognome = String(input.Cognome ?? '').trim()
  const nome = String(input.Nome ?? '').trim()
  out.Title = `${cognome} ${nome}`.trim() || 'Senza nome'
  return out
}

// ------------------------------------------------------------------
// Lettura
// ------------------------------------------------------------------
export async function getItems(entity: RUEntity): Promise<RURecord[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase(entity)}?$select=${selectFields(entity)}&$orderby=fields/Cognome asc&$top=1000`,
    PREFER_NON_INDEXED,
  )
  return res.value.map((it) => mapItem(entity, it))
}

export async function getItem(entity: RUEntity, spItemId: string): Promise<RURecord> {
  const item = await graphGet<any>(
    `/sites/${SITE()}/lists/${listId(entity)}/items/${spItemId}?$select=${selectFields(entity)}`,
  )
  return mapItem(entity, item)
}

// ------------------------------------------------------------------
// Scrittura
// ------------------------------------------------------------------
export async function creaItem(entity: RUEntity, input: Record<string, unknown>): Promise<RURecord> {
  const res = await graphPost<any>(listBase(entity), { fields: buildFields(entity, input) })
  return getItem(entity, res.id)
}

export async function aggiornaItem(entity: RUEntity, spItemId: string, input: Record<string, unknown>): Promise<RURecord> {
  await graphPatch(
    `/sites/${SITE()}/lists/${listId(entity)}/items/${spItemId}/fields`,
    buildFields(entity, input),
  )
  return getItem(entity, spItemId)
}

export async function eliminaItem(entity: RUEntity, spItemId: string): Promise<void> {
  await graphDelete(`${listBase(entity)}/${spItemId}`)
}

/** Validazione minima: Cognome e Nome obbligatori. Ritorna messaggio o null. */
export function validaInput(input: Record<string, unknown>): string | null {
  const cognome = String(input.Cognome ?? '').trim()
  const nome = String(input.Nome ?? '').trim()
  if (!cognome && !nome) return 'Cognome e Nome sono obbligatori.'
  if (!cognome) return 'Il Cognome è obbligatorio.'
  if (!nome) return 'Il Nome è obbligatorio.'
  return null
}

// ==================================================================
// Cartella personale del dipendente (document library del sito)
// Struttura: <FOLDER_ROOT>/<Cognome Nome - Matricola>
// ==================================================================
const FOLDER_ROOT = process.env.SP_RU_FOLDER || 'Risorse Umane/Dipendenti'

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function sanitize(s: string): string {
  return (s || '')
    .replace(/[\\/:*?"<>|#%]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

let _driveIdCache: string | null = null
async function getDriveId(): Promise<string> {
  if (process.env.SP_RU_DRIVE_ID) return process.env.SP_RU_DRIVE_ID
  if (_driveIdCache) return _driveIdCache
  const d = await graphGet<{ id: string }>(`/sites/${SITE()}/drive?$select=id`)
  _driveIdCache = d.id
  return d.id
}

/** Crea (idempotente) l'intero percorso di cartelle e ritorna il path finale. */
async function ensureFolderPath(driveId: string, fullPath: string): Promise<void> {
  const segments = fullPath.split('/').filter(Boolean)
  let parent = '' // path relativo alla root
  for (const seg of segments) {
    const current = parent ? `${parent}/${seg}` : seg
    const existing = await graphGetOrNull<{ id: string }>(
      `/drives/${driveId}/root:/${encodePath(current)}?$select=id`,
    )
    if (!existing) {
      const parentEndpoint = parent
        ? `/drives/${driveId}/root:/${encodePath(parent)}:/children`
        : `/drives/${driveId}/root/children`
      await graphPost(parentEndpoint, {
        name: seg,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      })
    }
    parent = current
  }
}

function nomeCartella(dip: RURecord): string {
  const base = `${dip.Cognome ?? ''} ${dip.Nome ?? ''}`.trim()
  const rif = (dip.Matricola as string) || (dip.IdAccess != null ? String(dip.IdAccess) : '')
  return sanitize(rif ? `${base} - ${rif}` : base) || `Dipendente ${dip.spItemId}`
}

/**
 * Restituisce (creandola al primo accesso) la cartella personale del dipendente.
 * Salva l'URL SharePoint della cartella nel campo CartellaUrl.
 */
export async function ensureCartellaDipendente(spItemId: string): Promise<{ url: string; path: string }> {
  const dip = await getItem('dipendenti', spItemId)
  const driveId = await getDriveId()
  const relPath = `${FOLDER_ROOT}/${nomeCartella(dip)}`
  await ensureFolderPath(driveId, relPath)
  const folder = await graphGet<{ webUrl: string }>(
    `/drives/${driveId}/root:/${encodePath(relPath)}?$select=webUrl`,
  )
  if (dip.CartellaUrl !== folder.webUrl) {
    await graphPatch(`/sites/${SITE()}/lists/${listId('dipendenti')}/items/${spItemId}/fields`, {
      CartellaUrl: folder.webUrl,
    })
  }
  return { url: folder.webUrl, path: relPath }
}

export interface DocumentoDipendente {
  id: string
  nome: string
  url: string
  dimensione?: number
  modificato?: string
}

/** Elenca i documenti nella cartella personale (vuoto se la cartella non esiste). */
export async function getDocumentiDipendente(spItemId: string): Promise<DocumentoDipendente[]> {
  const dip = await getItem('dipendenti', spItemId)
  const driveId = await getDriveId()
  const relPath = `${FOLDER_ROOT}/${nomeCartella(dip)}`
  const res = await graphGetOrNull<{ value: any[] }>(
    `/drives/${driveId}/root:/${encodePath(relPath)}:/children?$select=id,name,webUrl,size,lastModifiedDateTime&$top=200`,
  )
  if (!res) return []
  return (res.value || [])
    .filter((c) => c.file) // solo file, non sottocartelle
    .map((c) => ({
      id: c.id,
      nome: c.name,
      url: c.webUrl,
      dimensione: c.size,
      modificato: c.lastModifiedDateTime,
    }))
}

/** Carica un documento (< 4 MB) nella cartella personale del dipendente. */
export async function caricaDocumentoDipendente(
  spItemId: string,
  filename: string,
  data: ArrayBuffer | Uint8Array,
  contentType?: string,
): Promise<DocumentoDipendente> {
  const dip = await getItem('dipendenti', spItemId)
  const driveId = await getDriveId()
  const relPath = `${FOLDER_ROOT}/${nomeCartella(dip)}`
  await ensureFolderPath(driveId, relPath)
  const safe = sanitize(filename) || 'documento'
  const res = await graphPutBinary<any>(
    `/drives/${driveId}/root:/${encodePath(`${relPath}/${safe}`)}:/content`,
    data,
    contentType,
  )
  // aggiorna CartellaUrl se non impostato
  if (!dip.CartellaUrl) {
    try { await ensureCartellaDipendente(spItemId) } catch { /* best effort */ }
  }
  return { id: res.id, nome: res.name ?? safe, url: res.webUrl, dimensione: res.size, modificato: res.lastModifiedDateTime }
}

/** Elimina un documento dalla cartella personale. */
export async function eliminaDocumentoDipendente(itemId: string): Promise<void> {
  const driveId = await getDriveId()
  await graphDelete(`/drives/${driveId}/items/${itemId}`)
}

export type { RUField }
