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
 *
 * ⚠️ IDENTITÀ. Ogni funzione riceve come PRIMO parametro un `GraphClient`, che
 * porta con sé l'identità con cui si opera. Sull'area RU l'identità è quella
 * dell'utente (accesso delegato), perché il log nativo Microsoft riporti la
 * persona reale. Il client si costruisce con `graphRU(session.user.email)` di
 * lib/graph-delegato.ts — mai importando direttamente lib/graph.ts qui.
 *
 * È un parametro esplicito e non una variabile di contesto implicita
 * (AsyncLocalStorage): più verboso, ma rende visibile in ogni riga con quale
 * identità si sta scrivendo. Su dati del personale è un vantaggio, non un costo.
 *
 * Sito: SP_SITE_RU (sito dedicato Risorse Umane). Finché non è impostata si usa
 * SHAREPOINT_SITE_ID, cioè l'assetto precedente — vedi `graphRU`.
 */

import type { GraphClient } from '@/lib/graph-delegato'
import {
  RU_CONFIG,
  type RUEntity,
  type RUField,
  type RURecord,
} from '@/types/risorse-umane'

const SITE = () => process.env.SP_SITE_RU || process.env.SHAREPOINT_SITE_ID!

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
export async function getItems(g: GraphClient, entity: RUEntity): Promise<RURecord[]> {
  const res = await g.get<{ value: any[] }>(
    `${listBase(entity)}?$select=${selectFields(entity)}&$orderby=fields/Cognome asc&$top=1000`,
    PREFER_NON_INDEXED,
  )
  return res.value.map((it) => mapItem(entity, it))
}

export async function getItem(g: GraphClient, entity: RUEntity, spItemId: string): Promise<RURecord> {
  const item = await g.get<any>(
    `/sites/${SITE()}/lists/${listId(entity)}/items/${spItemId}?$select=${selectFields(entity)}`,
  )
  return mapItem(entity, item)
}

// ------------------------------------------------------------------
// Scrittura
// ------------------------------------------------------------------
export async function creaItem(g: GraphClient, entity: RUEntity, input: Record<string, unknown>): Promise<RURecord> {
  const res = await g.post<any>(listBase(entity), { fields: buildFields(entity, input) })
  return getItem(g, entity, res.id)
}

export async function aggiornaItem(g: GraphClient, entity: RUEntity, spItemId: string, input: Record<string, unknown>): Promise<RURecord> {
  await g.patch(
    `/sites/${SITE()}/lists/${listId(entity)}/items/${spItemId}/fields`,
    buildFields(entity, input),
  )
  return getItem(g, entity, spItemId)
}

export async function eliminaItem(g: GraphClient, entity: RUEntity, spItemId: string): Promise<void> {
  await g.del(`${listBase(entity)}/${spItemId}`)
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
// Struttura: <folderRoot()>/<Cognome Nome - Matricola>
// ==================================================================
/**
 * Radice delle cartelle personali, relativa alla raccolta documenti del sito.
 * Sul sito dedicato: "Risorse Umane App/Dipendenti" (dentro `Documenti condivisi`).
 * Funzione e non costante: l'env cambia col cutover.
 */
const folderRoot = () => process.env.SP_RU_FOLDER || 'Risorse Umane/Dipendenti'

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

/**
 * Cache del drive id, per sito. Si può cachare a livello di modulo — al
 * contrario del token — perché il drive è una proprietà del SITO e non
 * dell'utente: due utenti diversi risolvono lo stesso valore.
 */
const _driveIdCache: Record<string, string> = {}

async function getDriveId(g: GraphClient): Promise<string> {
  if (process.env.SP_RU_DRIVE_ID) return process.env.SP_RU_DRIVE_ID
  const site = SITE()
  const inCache = _driveIdCache[site]
  if (inCache) return inCache
  const d = await g.get<{ id: string }>(`/sites/${site}/drive?$select=id`)
  _driveIdCache[site] = d.id
  return d.id
}

/** Crea (idempotente) l'intero percorso di cartelle e ritorna il path finale. */
async function ensureFolderPath(g: GraphClient, driveId: string, fullPath: string): Promise<void> {
  const segments = fullPath.split('/').filter(Boolean)
  let parent = '' // path relativo alla root
  for (const seg of segments) {
    const current = parent ? `${parent}/${seg}` : seg
    const existing = await g.getOrNull<{ id: string }>(
      `/drives/${driveId}/root:/${encodePath(current)}?$select=id`,
    )
    if (!existing) {
      const parentEndpoint = parent
        ? `/drives/${driveId}/root:/${encodePath(parent)}:/children`
        : `/drives/${driveId}/root/children`
      await g.post(parentEndpoint, {
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
export async function ensureCartellaDipendente(g: GraphClient, spItemId: string): Promise<{ url: string; path: string }> {
  const dip = await getItem(g, 'dipendenti', spItemId)
  const driveId = await getDriveId(g)
  const relPath = `${folderRoot()}/${nomeCartella(dip)}`
  await ensureFolderPath(g, driveId, relPath)
  const folder = await g.get<{ webUrl: string }>(
    `/drives/${driveId}/root:/${encodePath(relPath)}?$select=webUrl`,
  )
  if (dip.CartellaUrl !== folder.webUrl) {
    await g.patch(`/sites/${SITE()}/lists/${listId('dipendenti')}/items/${spItemId}/fields`, {
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
export async function getDocumentiDipendente(g: GraphClient, spItemId: string): Promise<DocumentoDipendente[]> {
  const dip = await getItem(g, 'dipendenti', spItemId)
  const driveId = await getDriveId(g)
  const relPath = `${folderRoot()}/${nomeCartella(dip)}`
  const res = await g.getOrNull<{ value: any[] }>(
    // ⚠️ `file` e `folder` vanno chiesti esplicitamente: senza di loro nel
    // $select, Graph non li restituisce e il filtro qui sotto scarterebbe tutto.
    `/drives/${driveId}/root:/${encodePath(relPath)}:/children?$select=id,name,webUrl,size,lastModifiedDateTime,file,folder&$top=200`,
  )
  if (!res) return []
  return (res.value || [])
    .filter((c) => !c.folder) // solo file, non sottocartelle
    .map((c) => ({
      id: c.id,
      nome: c.name,
      url: c.webUrl,
      dimensione: c.size,
      modificato: c.lastModifiedDateTime,
    }))
}

export interface SessioneUpload {
  /** URL pre-autorizzato su cui il browser carica il file, a blocchi. */
  uploadUrl: string
  /** Scadenza dell'URL (ISO). Passata quella, va richiesta una sessione nuova. */
  scadeIl: string
  /** Nome definitivo del file, già sanificato e con il prefisso della categoria. */
  nomeFile: string
}

/**
 * Apre una sessione di caricamento su SharePoint e restituisce l'URL a cui il
 * browser invierà il file **direttamente**, senza passare da noi.
 *
 * Perché non far transitare il file dal server, come faceva la versione
 * precedente con `caricaDocumentoDipendente`:
 *
 * 1. **Il file non attraversa Vercel.** Prima i byte di una carta d'identità
 *    stavano nella memoria della funzione per la durata della richiesta. Ora
 *    Vercel vede solo la richiesta di questa sessione.
 * 2. **Cade il limite dei 4 MB**, che era la somma di due vincoli: l'upload
 *    semplice di Graph si ferma lì, e Vercel accetta corpi fino a ~4,5 MB.
 * 3. **Nessun rischio di timeout.** Il caricamento non occupa più una funzione
 *    serverless per tutta la sua durata: su piano Hobby il limite è 10 secondi,
 *    che una connessione lenta con un PDF di qualche MB può superare.
 *
 * ⚠️ L'URL restituito è **pre-autorizzato**: chi lo possiede può scrivere in
 * quella cartella fino alla scadenza, senza altre credenziali. Va consegnato
 * solo a chi ha diritto di caricare e non deve finire in alcun log.
 */
export async function creaSessioneUploadDocumento(
  g: GraphClient,
  spItemId: string,
  filename: string,
): Promise<SessioneUpload> {
  const dip = await getItem(g, 'dipendenti', spItemId)
  const driveId = await getDriveId(g)
  const relPath = `${folderRoot()}/${nomeCartella(dip)}`
  await ensureFolderPath(g, driveId, relPath)

  const safe = sanitize(filename) || 'documento'
  const res = await g.post<{ uploadUrl: string; expirationDateTime: string }>(
    `/drives/${driveId}/root:/${encodePath(`${relPath}/${safe}`)}:/createUploadSession`,
    {
      item: {
        '@microsoft.graph.conflictBehavior': 'rename',
        name: safe,
      },
    },
  )

  return { uploadUrl: res.uploadUrl, scadeIl: res.expirationDateTime, nomeFile: safe }
}

/**
 * Carica un documento (< 4 MB) nella cartella personale del dipendente.
 *
 * Resta in uso per i caricamenti che partono dal SERVER — oggi solo il foglio
 * ore alla chiusura mensile, che genera il file in memoria e non ha un browser
 * davanti. Per i caricamenti dell'utente si usa `creaSessioneUploadDocumento`.
 */
export async function caricaDocumentoDipendente(
  g: GraphClient,
  spItemId: string,
  filename: string,
  data: ArrayBuffer | Uint8Array,
  contentType?: string,
): Promise<DocumentoDipendente> {
  const dip = await getItem(g, 'dipendenti', spItemId)
  const driveId = await getDriveId(g)
  const relPath = `${folderRoot()}/${nomeCartella(dip)}`
  await ensureFolderPath(g, driveId, relPath)
  const safe = sanitize(filename) || 'documento'
  const res = await g.putBinary<any>(
    `/drives/${driveId}/root:/${encodePath(`${relPath}/${safe}`)}:/content`,
    data,
    contentType,
  )
  // aggiorna CartellaUrl se non impostato
  if (!dip.CartellaUrl) {
    try { await ensureCartellaDipendente(g, spItemId) } catch { /* best effort */ }
  }
  return { id: res.id, nome: res.name ?? safe, url: res.webUrl, dimensione: res.size, modificato: res.lastModifiedDateTime }
}

/**
 * Conversione in PDF di un documento gia' presente nella cartella personale.
 *
 * La fa Graph (`?format=pdf`): e' il motivo per cui il foglio ore viene prima
 * caricato e poi convertito, invece di generare il PDF in proprio. Nessun
 * motore di stampa da installare, nessuna dipendenza in piu'.
 */
export async function pdfDocumentoDipendente(g: GraphClient, itemId: string): Promise<Buffer> {
  const driveId = await getDriveId(g)
  return g.getBinary(`/drives/${driveId}/items/${itemId}/content?format=pdf`)
}

/** Elimina un documento dalla cartella personale. */
export async function eliminaDocumentoDipendente(g: GraphClient, itemId: string): Promise<void> {
  const driveId = await getDriveId(g)
  await g.del(`/drives/${driveId}/items/${itemId}`)
}

export type { RUField }
