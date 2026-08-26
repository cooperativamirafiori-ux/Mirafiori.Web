/**
 * L'allegato di un ticket: uno screenshot dell'errore, la foto della stampante.
 *
 * Un'immagine risparmia tre mail di chiarimento, quindi vale il campo; ma è un
 * di più, non un pilastro: se la libreria non è configurata il ticket si apre
 * lo stesso, senza il campo. Per questo `allegatiAttivi()` esiste.
 *
 * I file NON passano dal nostro server: il browser carica direttamente su
 * SharePoint con `lib/core/upload-diretto`, qui si aprono solo la sessione e la
 * conferma. Tutti in **una cartella sola**, col codice del ticket nel nome —
 * stessa scelta dei verbali IT: si ritrovano cercando "ASS-2026-014" anche da
 * SharePoint, senza una cartella per ticket che sarebbe vuota nel 90% dei casi.
 *
 * Variabili d'ambiente (entrambe facoltative):
 *   SP_ASSISTENZA_DRIVE_ID  drive della libreria; senza, la libreria predefinita del sito
 *   SP_ASSISTENZA_FOLDER    cartella; default "Allegati Assistenza"
 */

import { graphGet, graphGetOrNull, graphPost } from '@/lib/core/graph'

const SITE = () => process.env.SHAREPOINT_SITE_ID!

const CARTELLA = () => (process.env.SP_ASSISTENZA_FOLDER || 'Allegati Assistenza').replace(/^\/+|\/+$/g, '')

let _driveIdCache: string | null = null

/** true se si può allegare: serve solo il sito, il resto ha un default. */
export function allegatiAttivi(): boolean {
  return Boolean(process.env.SHAREPOINT_SITE_ID)
}

async function getDriveId(): Promise<string> {
  if (process.env.SP_ASSISTENZA_DRIVE_ID) return process.env.SP_ASSISTENZA_DRIVE_ID
  if (_driveIdCache) return _driveIdCache
  const d = await graphGet<{ id: string }>(`/sites/${SITE()}/drive?$select=id`)
  _driveIdCache = d.id
  return d.id
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function sanitizeNome(s: string, fallback = 'allegato'): string {
  const pulito = (s || fallback)
    .replace(/[\\/:*?"<>|#%~&{}]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
  return (pulito || fallback).slice(0, 90)
}

/** Crea la cartella se manca. Una sola, senza sottocartelle per ticket. */
async function assicuraCartella(driveId: string): Promise<void> {
  const nome = CARTELLA()
  if (!nome) return
  const esiste = await graphGetOrNull<{ id: string }>(
    `/drives/${driveId}/root:/${encodePath(nome)}?$select=id`,
  )
  if (esiste) return
  await graphPost(`/drives/${driveId}/root/children`, {
    name: nome,
    folder: {},
    // "fail" e non "rename": se è comparsa nel frattempo la riusiamo, invece
    // di ritrovarci "Allegati Assistenza 1" accanto all'originale.
    '@microsoft.graph.conflictBehavior': 'fail',
  }).catch(async (err) => {
    const ancora = await graphGetOrNull<{ id: string }>(
      `/drives/${driveId}/root:/${encodePath(nome)}?$select=id`,
    )
    if (!ancora) throw err
  })
}

/** "ASS-2026-014 - schermata errore.png" */
function nomeAllegato(codice: string, filenameOriginale: string): string {
  const est = (filenameOriginale.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '').toLowerCase()
  const base = filenameOriginale.replace(/\.[A-Za-z0-9]{1,8}$/, '')
  return sanitizeNome(`${codice} - ${base}`, codice) + est
}

const percorso = (nomeFile: string) => {
  const c = CARTELLA()
  return c ? `${c}/${nomeFile}` : nomeFile
}

/**
 * Apre la sessione di caricamento e restituisce l'URL pre-autorizzato.
 *
 * ⚠️ L'`uploadUrl` è una credenziale a tempo: non loggarlo.
 */
export async function creaSessioneAllegato(
  codice: string,
  filename: string,
): Promise<{ uploadUrl: string; scadeIl: string; nomeFile: string }> {
  const driveId = await getDriveId()
  await assicuraCartella(driveId)
  const nomeFile = nomeAllegato(codice, filename)

  const res = await graphPost<{ uploadUrl: string; expirationDateTime: string }>(
    `/drives/${driveId}/root:/${encodePath(percorso(nomeFile))}:/createUploadSession`,
    { item: { '@microsoft.graph.conflictBehavior': 'replace', name: nomeFile } },
  )
  return { uploadUrl: res.uploadUrl, scadeIl: res.expirationDateTime, nomeFile }
}

/** Ritrova il file che il browser ha già caricato e ne dà url e nome. */
export async function trovaAllegato(
  nomeFile: string,
): Promise<{ url: string; nome: string }> {
  const driveId = await getDriveId()
  const safe = sanitizeNome(nomeFile, nomeFile)
  const file = await graphGetOrNull<{ webUrl: string; name: string }>(
    `/drives/${driveId}/root:/${encodePath(percorso(safe))}?$select=webUrl,name`,
  )
  if (!file) throw new Error('File non trovato su SharePoint: riprova il caricamento')
  return { url: file.webUrl, nome: file.name }
}
