/**
 * Operazioni SharePoint per la sezione Prestazioni Occasionali.
 *   - Lista "Prestazioni Occasionali"  (SP_LIST_PRESTAZIONI)
 *   - Cartelle nella document library   (SP_PRESTAZIONI_DRIVE_ID opzionale → default drive del sito)
 *
 * Struttura cartelle:
 *   {ROOT}/{Cognome_Nome_CF}/Prestazione_{YYYY-MM-DD}
 *   dove ROOT = SP_PRESTAZIONI_FOLDER_PATH (default "Prestazioni Occasionali")
 */

import { graphGet, graphGetOrNull, graphPost, graphPatch, graphPutBinary } from '@/lib/graph'
import type {
  Prestazione,
  StatoPrestazione,
  DatiPrestatore,
  DatiPrestazione,
  CartellaInfo,
} from '@/types/prestazioni'

const SITE = () => process.env.SHAREPOINT_SITE_ID!
const PRESTAZIONI_LIST = () => process.env.SP_LIST_PRESTAZIONI!
const ROOT_FOLDER = () => process.env.SP_PRESTAZIONI_FOLDER_PATH || 'Prestazioni Occasionali'

/** Sottocartella (a livello prestatore) con i documenti d'identità riutilizzabili */
const DOCS_IDENTITA = 'Documenti Identità'

const listBase = () => `/sites/${SITE()}/lists/${PRESTAZIONI_LIST()}/items`

/** Sessione di upload Graph: l'URL è pre-autorizzato e scade da solo. */
export interface SessioneUpload {
  uploadUrl: string
  scadeIl: string
  nomeFile: string
}

// ============================================================
// Helpers
// ============================================================

/** Rimuove i caratteri non ammessi da SharePoint nei nomi cartella */
export function sanitizeFolderName(s: string): string {
  return s
    .trim()
    .replace(/["*:<>?/\\|#%]/g, '') // caratteri vietati in SP
    .replace(/\s+/g, ' ')
    .trim()
}

/** Nome cartella prestatore: Cognome_Nome_CF */
export function nomeCartellaPrestatore(p: Pick<DatiPrestatore, 'nome' | 'cognome' | 'codiceFiscale'>): string {
  return sanitizeFolderName(`${p.cognome}_${p.nome}_${p.codiceFiscale.toUpperCase()}`)
}

/** Nome sottocartella prestazione: Prestazione_YYYY-MM-DD (data di registrazione) */
export function nomeSottocartella(data: string): string {
  const giorno = (data || '').slice(0, 10) || 'senza-data'
  return `Prestazione_${giorno}`
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

let _driveIdCache: string | null = null
async function getDriveId(): Promise<string> {
  if (process.env.SP_PRESTAZIONI_DRIVE_ID) return process.env.SP_PRESTAZIONI_DRIVE_ID
  if (_driveIdCache) return _driveIdCache
  const d = await graphGet<{ id: string }>(`/sites/${SITE()}/drive?$select=id`)
  _driveIdCache = d.id
  return d.id
}

// ============================================================
// Cartelle (Drive API)
// ============================================================

/** Crea la cartella se non esiste, altrimenti ritorna quella esistente */
async function ensureFolder(
  driveId: string,
  parentPath: string,
  name: string,
): Promise<CartellaInfo> {
  const fullPath = parentPath ? `${parentPath}/${name}` : name

  const existing = await graphGetOrNull<{ id: string; webUrl: string }>(
    `/drives/${driveId}/root:/${encodePath(fullPath)}?$select=id,webUrl`,
  )
  if (existing) {
    return { id: existing.id, webUrl: existing.webUrl, path: fullPath }
  }

  const childrenEndpoint = parentPath
    ? `/drives/${driveId}/root:/${encodePath(parentPath)}:/children`
    : `/drives/${driveId}/root/children`

  const created = await graphPost<{ id: string; webUrl: string }>(childrenEndpoint, {
    name,
    folder: {},
    '@microsoft.graph.conflictBehavior': 'rename',
  })
  return { id: created.id, webUrl: created.webUrl, path: fullPath }
}

/**
 * Garantisce ROOT/{Cognome_Nome_CF}/Prestazione_{data}.
 * `dataCartella` è la data di registrazione della pratica (DataInserimento):
 * va passata sempre uguale così tutte le operazioni della pratica ritrovano la
 * stessa sottocartella. Se la cartella del prestatore esiste già, crea solo la
 * nuova sottocartella.
 */
export async function ensureCartellaPrestazione(
  p: Pick<DatiPrestatore, 'nome' | 'cognome' | 'codiceFiscale'> & { dataCartella: string },
): Promise<{ prestatore: CartellaInfo; prestazione: CartellaInfo }> {
  const driveId = await getDriveId()
  const root = await ensureFolder(driveId, '', ROOT_FOLDER())
  const prestatore = await ensureFolder(driveId, root.path, nomeCartellaPrestatore(p))
  const prestazione = await ensureFolder(driveId, prestatore.path, nomeSottocartella(p.dataCartella))
  return { prestatore, prestazione }
}

/**
 * Garantisce ROOT/{Cognome_Nome_CF}/Documenti Identità.
 * Qui vivono i documenti d'identità del prestatore, caricati una sola volta
 * e riutilizzati per tutte le prestazioni successive.
 */
export async function ensureCartellaDocumentiIdentita(
  p: Pick<DatiPrestatore, 'nome' | 'cognome' | 'codiceFiscale'>,
): Promise<CartellaInfo> {
  const driveId = await getDriveId()
  const root = await ensureFolder(driveId, '', ROOT_FOLDER())
  const prestatore = await ensureFolder(driveId, root.path, nomeCartellaPrestatore(p))
  return ensureFolder(driveId, prestatore.path, DOCS_IDENTITA)
}

/**
 * True se il prestatore ha già almeno un documento d'identità archiviato
 * nella cartella "Documenti Identità" (così il form non li richiede di nuovo).
 */
export async function haDocumentiIdentita(
  p: Pick<DatiPrestatore, 'nome' | 'cognome' | 'codiceFiscale'>,
): Promise<boolean> {
  const driveId = await getDriveId()
  const folderPath = `${ROOT_FOLDER()}/${nomeCartellaPrestatore(p)}/${DOCS_IDENTITA}`
  const res = await graphGetOrNull<{ value: any[] }>(
    `/drives/${driveId}/root:/${encodePath(folderPath)}:/children?$select=id&$top=2`,
  )
  return !!res && Array.isArray(res.value) && res.value.length > 0
}

/** Variante che parte dal solo codice fiscale (risale a nome/cognome dall'anagrafica) */
export async function haDocumentiIdentitaPerCf(cf: string): Promise<boolean> {
  const target = (cf || '').toUpperCase().trim()
  if (!target) return false
  const anagrafica = await getAnagraficaPrestatori()
  const p = anagrafica.find((x) => x.codiceFiscale.toUpperCase() === target)
  if (!p) return false
  return haDocumentiIdentita(p)
}

/**
 * Apre una sessione di upload su SharePoint per un file nella cartella indicata
 * e ritorna l'URL pre-autorizzato che il browser userà per il PUT diretto.
 *
 * È il sostituto di `uploadAllegato` per i file che arrivano dal browser: così
 * i byte non passano più dalla funzione serverless (e cade il limite dei 4 MB).
 * `uploadAllegato` resta per i file generati dal server (contratti, notula).
 *
 * ⚠️ L'`uploadUrl` è di fatto una credenziale a tempo: non va mai loggato né
 * restituito a chi non è autorizzato a scrivere in quella cartella.
 */
export async function creaSessioneUpload(
  folderPath: string,
  filename: string,
): Promise<SessioneUpload> {
  const driveId = await getDriveId()
  const safeName = sanitizeFolderName(filename) || 'allegato'
  const res = await graphPost<{ uploadUrl: string; expirationDateTime: string }>(
    `/drives/${driveId}/root:/${encodePath(`${folderPath}/${safeName}`)}:/createUploadSession`,
    { item: { '@microsoft.graph.conflictBehavior': 'replace', name: safeName } },
  )
  return { uploadUrl: res.uploadUrl, scadeIl: res.expirationDateTime, nomeFile: safeName }
}

/**
 * webUrl di un file già presente in una cartella (serve nel passo di conferma,
 * quando il browser ha caricato direttamente e il server deve salvare il link).
 */
export async function getWebUrlFile(
  folderPath: string,
  nomeFile: string,
): Promise<string | null> {
  const driveId = await getDriveId()
  const res = await graphGetOrNull<{ webUrl: string }>(
    `/drives/${driveId}/root:/${encodePath(`${folderPath}/${nomeFile}`)}?$select=webUrl`,
  )
  return res?.webUrl ?? null
}

/** Carica un file (< 4 MB) nella cartella indicata */
export async function uploadAllegato(
  folderPath: string,
  filename: string,
  data: ArrayBuffer | Uint8Array,
  contentType?: string,
): Promise<{ webUrl: string }> {
  const driveId = await getDriveId()
  const safeName = sanitizeFolderName(filename) || 'allegato'
  const res = await graphPutBinary<{ webUrl: string }>(
    `/drives/${driveId}/root:/${encodePath(`${folderPath}/${safeName}`)}:/content`,
    data,
    contentType,
  )
  return { webUrl: res.webUrl }
}

// ============================================================
// Lista Prestazioni
// ============================================================

const PRESTAZIONE_FIELDS =
  'id,fields&$expand=fields($select=Title,Nome,Cognome,DataNascita,LuogoNascita,CodiceFiscale,Residenza,Ruolo,Email,Telefono,Iban,Giorni,DataInizio,DataFine,Attivita,CompensoPrevisto,CasisticaGdpr,Stato,ResponsabileEmail,ResponsabileNome,CartellaUrl,ImportoLordo,DataInserimento,NotulaToken,NotulaUrl,PromemoriaOreInviato,DocusignEnvelopeId)'

/**
 * Colonne data "solo giorno" (DataNascita, DataInizio, DataFine): vanno scritte
 * a mezzogiorno UTC per non scavallare mai la mezzanotte in nessun fuso orario
 * (altrimenti SharePoint le salva come 23:00 del giorno prima e a ogni
 * salvataggio successivo la data perde un giorno). In lettura le normalizziamo
 * a "YYYY-MM-DD" così il resto dell'app vede sempre una data pulita.
 */
function toGraphDateOnly(d?: string): string | undefined {
  if (!d) return d
  const giorno = d.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(giorno) ? `${giorno}T12:00:00Z` : d
}
function soloData(d?: string): string {
  return (d ?? '').slice(0, 10)
}

function mapPrestazione(item: any): Prestazione {
  const f = item.fields ?? {}
  return {
    spItemId: item.id,
    idPrestazione: f.Title ?? '',
    nome: f.Nome ?? '',
    cognome: f.Cognome ?? '',
    dataNascita: soloData(f.DataNascita),
    luogoNascita: f.LuogoNascita ?? '',
    codiceFiscale: f.CodiceFiscale ?? '',
    residenza: f.Residenza ?? '',
    ruolo: f.Ruolo ?? '',
    email: f.Email ?? '',
    telefono: f.Telefono ?? '',
    iban: f.Iban ?? '',
    giorni: f.Giorni ?? 0,
    dataInizio: soloData(f.DataInizio),
    dataFine: soloData(f.DataFine),
    attivita: f.Attivita ?? '',
    compensoPrevisto: f.CompensoPrevisto ?? 0,
    casisticaGdpr: f.CasisticaGdpr ?? '',
    stato: (f.Stato ?? 'Bozza') as StatoPrestazione,
    responsabileEmail: f.ResponsabileEmail ?? '',
    responsabileNome: f.ResponsabileNome ?? '',
    cartellaUrl: f.CartellaUrl ?? undefined,
    importoLordo: f.ImportoLordo ?? undefined,
    dataInserimento: f.DataInserimento ?? '',
    notulaToken: f.NotulaToken ?? undefined,
    notulaUrl: f.NotulaUrl ?? undefined,
    promemoriaOreInviato: f.PromemoriaOreInviato ?? false,
    docusignEnvelopeId: f.DocusignEnvelopeId ?? undefined,
  }
}

/** Tutte le prestazioni non chiuse (per la pagina "attive") */
export async function getPrestazioniAttive(): Promise<Prestazione[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase()}?$select=${PRESTAZIONE_FIELDS}&$filter=fields/Stato ne 'Chiusa'&$orderby=fields/DataInserimento desc&$top=500`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
  )
  return res.value.map(mapPrestazione)
}

export async function getPrestazioneById(spItemId: string): Promise<Prestazione> {
  const item = await graphGet<any>(
    `/sites/${SITE()}/lists/${PRESTAZIONI_LIST()}/items/${spItemId}?$select=${PRESTAZIONE_FIELDS}`,
  )
  return mapPrestazione(item)
}

/** Crea la prestazione (Stato="Bozza") — ritorna item id e id numerico per il progressivo */
export async function creaPrestazione(
  dati: DatiPrestatore & DatiPrestazione,
  responsabile: { email: string; nome: string },
): Promise<{ spItemId: string; numericId: number; dataInserimento: string }> {
  const dataInserimento = new Date().toISOString()
  const fields = {
    Nome: dati.nome,
    Cognome: dati.cognome,
    DataNascita: toGraphDateOnly(dati.dataNascita),
    LuogoNascita: dati.luogoNascita,
    CodiceFiscale: dati.codiceFiscale.toUpperCase(),
    Residenza: dati.residenza,
    Ruolo: dati.ruolo,
    Email: dati.email,
    Telefono: dati.telefono,
    Iban: dati.iban,
    Giorni: dati.giorni,
    DataInizio: toGraphDateOnly(dati.dataInizio),
    DataFine: toGraphDateOnly(dati.dataFine),
    Attivita: dati.attivita,
    CompensoPrevisto: dati.compensoPrevisto,
    CasisticaGdpr: dati.casisticaGdpr,
    Stato: 'Bozza' as StatoPrestazione,
    ResponsabileEmail: responsabile.email,
    ResponsabileNome: responsabile.nome,
    DataInserimento: dataInserimento,
  }
  const res = await graphPost<any>(listBase(), { fields })
  return {
    spItemId: res.id,
    numericId: res.fields?.id ?? Number(res.id) ?? 0,
    dataInserimento,
  }
}

export async function aggiornaPrestazione(
  spItemId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await graphPatch(
    `/sites/${SITE()}/lists/${PRESTAZIONI_LIST()}/items/${spItemId}/fields`,
    fields,
  )
}

/** Tutte le prestazioni (qualsiasi stato), più recenti prima */
export async function getTuttePrestazioni(): Promise<Prestazione[]> {
  const res = await graphGet<{ value: any[] }>(
    `${listBase()}?$select=${PRESTAZIONE_FIELDS}&$orderby=fields/DataInserimento desc&$top=999`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
  )
  return res.value.map(mapPrestazione)
}

/**
 * Anagrafica prestatori: dati anagrafici distinti (per codice fiscale) ricavati
 * dalle prestazioni già inserite. Tiene la versione più recente di ogni prestatore,
 * così la selezione nel form non costringe a reinserire i dati.
 */
export async function getAnagraficaPrestatori(): Promise<DatiPrestatore[]> {
  const tutte = await getTuttePrestazioni() // già ordinate per data desc
  const visti = new Set<string>()
  const out: DatiPrestatore[] = []
  for (const p of tutte) {
    const cf = (p.codiceFiscale || '').toUpperCase()
    if (!cf || visti.has(cf)) continue
    visti.add(cf)
    out.push({
      nome: p.nome,
      cognome: p.cognome,
      dataNascita: p.dataNascita,
      luogoNascita: p.luogoNascita,
      codiceFiscale: cf,
      residenza: p.residenza,
      ruolo: p.ruolo,
      email: p.email,
      telefono: p.telefono,
      iban: p.iban,
    })
  }
  return out.sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`))
}

/** Trova una prestazione dal token monouso della notula (per l'upload pubblico) */
export async function getPrestazioneByToken(token: string): Promise<Prestazione | null> {
  if (!token) return null
  const filter = encodeURIComponent(`fields/NotulaToken eq '${token.replace(/'/g, "''")}'`)
  const res = await graphGet<{ value: any[] }>(
    `${listBase()}?$select=${PRESTAZIONE_FIELDS}&$filter=${filter}&$top=1`,
    { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
  )
  return res.value.length ? mapPrestazione(res.value[0]) : null
}
