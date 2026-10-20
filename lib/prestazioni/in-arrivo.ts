/**
 * Documenti d'identità "in arrivo": caricati PRIMA che la pratica esista.
 *
 * Per un prestatore nuovo non sappiamo ancora nome e codice fiscale: li legge
 * Claude proprio da questi file. Quindi la cartella definitiva
 * `ROOT/{Cognome_Nome_CF}/Documenti Identità` non si può ancora creare, e i
 * file vanno in un appoggio:
 *
 *   ROOT/_In arrivo/{lotto}/          ← un lotto = un inserimento nel modulo
 *
 * Al "Salva" `archiviaLotto` SPOSTA i file (non li copia) nella cartella
 * definitiva e cancella il lotto. Se la pratica non viene mai salvata, il cron
 * giornaliero (`pulisciInArrivo`) cancella i lotti più vecchi di 7 giorni: non
 * devono restare documenti d'identità in giro.
 *
 * Il lotto è un UUID generato dal server: il client lo rimanda indietro, quindi
 * va sempre validato con `lottoValido` (niente percorsi scelti dal browser).
 */

import { randomUUID } from 'node:crypto'
import { graphGetOrNull, graphGetBinary, graphPatch, graphDelete } from '@/lib/core/graph'
import {
  ROOT_FOLDER,
  getDriveId,
  ensureFolder,
  encodePath,
  ensureCartellaDocumentiIdentita,
  creaSessioneUpload,
  sanitizeFolderName,
  type SessioneUpload,
} from './data'
import type { DatiPrestatore } from '@/types/prestazioni'

export const CARTELLA_IN_ARRIVO = '_In arrivo'

/** Dopo quanti giorni un lotto mai salvato viene cancellato. */
export const GIORNI_CONSERVAZIONE_IN_ARRIVO = 7

const LOTTO_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function lottoValido(lotto: unknown): lotto is string {
  return typeof lotto === 'string' && LOTTO_RE.test(lotto)
}

export function nuovoLotto(): string {
  return randomUUID()
}

const percorsoLotto = (lotto: string) => `${ROOT_FOLDER()}/${CARTELLA_IN_ARRIVO}/${lotto}`

export interface FileInArrivo {
  id: string
  nome: string
  dimensione: number
  mimeType: string
}

/** Apre la sessione di upload diretto per un file del lotto. */
export async function apriSessioneInArrivo(
  lotto: string,
  filename: string,
): Promise<SessioneUpload> {
  const driveId = await getDriveId()
  const root = await ensureFolder(driveId, '', ROOT_FOLDER())
  const appoggio = await ensureFolder(driveId, root.path, CARTELLA_IN_ARRIVO)
  const cartella = await ensureFolder(driveId, appoggio.path, lotto)
  // Prefisso col momento del caricamento: due foto entrambe "image.jpg" (capita
  // da telefono) non si sovrascrivono a vicenda.
  const nome = `${Date.now()}_${sanitizeFolderName(filename) || 'documento'}`
  return creaSessioneUpload(cartella.path, nome)
}

/** File presenti nel lotto (vuoto se il lotto non esiste). */
export async function fileInArrivo(lotto: string): Promise<FileInArrivo[]> {
  const driveId = await getDriveId()
  const res = await graphGetOrNull<{ value: any[] }>(
    `/drives/${driveId}/root:/${encodePath(percorsoLotto(lotto))}:/children` +
      `?$select=id,name,size,file&$top=50`,
  )
  return (res?.value ?? [])
    .filter((x) => x.file)
    .map((x) => ({
      id: x.id,
      nome: x.name,
      dimensione: x.size ?? 0,
      mimeType: x.file?.mimeType ?? 'application/octet-stream',
    }))
}

/** Contenuto originale del file. */
export async function scaricaFileInArrivo(id: string): Promise<Buffer> {
  const driveId = await getDriveId()
  return graphGetBinary(`/drives/${driveId}/items/${id}/content`)
}

/**
 * Versione JPEG ridotta, generata da SharePoint. Serve per le foto troppo
 * pesanti o in formati che Claude non legge (HEIC dell'iPhone, TIFF): così non
 * serve una libreria d'immagini sul server. Prima chiede 2000 px, poi la
 * miniatura "large" standard se il formato su misura non c'è.
 */
export async function miniaturaJpeg(id: string): Promise<Buffer | null> {
  const driveId = await getDriveId()
  for (const misura of ['c2000x2000', 'large']) {
    try {
      const b = await graphGetBinary(`/drives/${driveId}/items/${id}/thumbnails/0/${misura}/content`)
      if (b.length > 0) return b
    } catch {
      // prova la misura successiva
    }
  }
  return null
}

/**
 * Sposta i file del lotto in `{Cognome_Nome_CF}/Documenti Identità` e cancella
 * il lotto. Ritorna i nomi finali (per il log).
 */
export async function archiviaLotto(
  lotto: string,
  prestatore: Pick<DatiPrestatore, 'nome' | 'cognome' | 'codiceFiscale'>,
): Promise<string[]> {
  const files = await fileInArrivo(lotto)
  if (!files.length) return []

  const driveId = await getDriveId()
  const dest = await ensureCartellaDocumentiIdentita(prestatore)
  const cf = prestatore.codiceFiscale.toUpperCase()
  const marca = new Date().toISOString().slice(0, 10)

  const archiviati: string[] = []
  for (const [i, f] of files.entries()) {
    const ext = f.nome.includes('.') ? f.nome.split('.').pop()!.toLowerCase() : 'pdf'
    const nome = `DocumentoIdentita_${cf}_${marca}_${i + 1}.${ext}`
    const r = await graphPatch<{ name: string }>(
      `/drives/${driveId}/items/${f.id}?@microsoft.graph.conflictBehavior=rename`,
      { parentReference: { driveId, id: dest.id }, name: nome },
    )
    archiviati.push(r?.name ?? nome)
  }

  await graphDelete(`/drives/${driveId}/root:/${encodePath(percorsoLotto(lotto))}`)
  return archiviati
}

/** Cancella i lotti mai salvati più vecchi di N giorni. Ritorna quanti. */
export async function pulisciInArrivo(
  giorni = GIORNI_CONSERVAZIONE_IN_ARRIVO,
): Promise<number> {
  const driveId = await getDriveId()
  const percorso = `${ROOT_FOLDER()}/${CARTELLA_IN_ARRIVO}`
  const res = await graphGetOrNull<{ value: any[] }>(
    `/drives/${driveId}/root:/${encodePath(percorso)}:/children?$select=id,name,createdDateTime,folder&$top=200`,
  )
  const lotti = res?.value ?? []

  const soglia = Date.now() - giorni * 24 * 60 * 60 * 1000
  let cancellati = 0
  for (const l of lotti) {
    if (!l.folder) continue
    if (new Date(l.createdDateTime).getTime() >= soglia) continue
    await graphDelete(`/drives/${driveId}/items/${l.id}`)
    cancellati++
  }
  return cancellati
}
