/**
 * La cartella SharePoint delle fatture XML: elenco, download, spostamento in
 * "Importate", salvataggio del PDF allegato.
 *
 * Sta sul sito dell'app (SHAREPOINT_SITE_ID = gruppo_ControlloGestione),
 * libreria Documenti. Percorso da SP_CARTELLA_FATTURE_SDI, di default
 * "General/fatture da SDI".
 */

import { graphGetAll, graphGetBinary, graphGetOrNull, graphPatch, graphPost, graphPutBinary } from '@/lib/core/graph'
import { SITE } from '@/lib/core/sp'

export interface FileSdi {
  id: string
  name: string
  size: number
  webUrl: string
}

export const cartellaSdi = () => process.env.SP_CARTELLA_FATTURE_SDI || 'General/fatture da SDI'
const IMPORTATE = 'Importate'

const percorso = (p: string) => encodeURIComponent(p).replace(/%2F/g, '/')
const drive = () => `/sites/${SITE()}/drive`

/** File (non cartelle) nella cartella di arrivo. */
export async function elencaFileSdi(): Promise<FileSdi[]> {
  const voci = await graphGetAll<any>(
    `${drive()}/root:/${percorso(cartellaSdi())}:/children?$select=id,name,size,file,webUrl&$top=200`,
  )
  return voci.filter((v) => v.file).map((v) => ({ id: v.id, name: v.name, size: v.size, webUrl: v.webUrl }))
}

export async function scaricaFileSdi(id: string): Promise<Uint8Array> {
  return new Uint8Array(await graphGetBinary(`${drive()}/items/${id}/content`))
}

/** Id della sottocartella "Importate", creata la prima volta. */
export async function cartellaImportate(): Promise<string> {
  const p = `${cartellaSdi()}/${IMPORTATE}`
  const esiste = await graphGetOrNull<{ id: string }>(`${drive()}/root:/${percorso(p)}`)
  if (esiste) return esiste.id
  try {
    const nuova = await graphPost<{ id: string }>(`${drive()}/root:/${percorso(cartellaSdi())}:/children`, {
      name: IMPORTATE,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    })
    return nuova.id
  } catch {
    // Creata nel frattempo da un altro giro: si rilegge.
    const ora = await graphGetOrNull<{ id: string }>(`${drive()}/root:/${percorso(p)}`)
    if (!ora) throw new Error(`Impossibile creare la cartella "${p}"`)
    return ora.id
  }
}

/** Sposta un file in "Importate". Se il nome c'è già, SharePoint lo rinomina. */
export async function spostaInImportate(idFile: string, idImportate: string): Promise<string> {
  const r = await graphPatch<{ webUrl: string }>(`${drive()}/items/${idFile}?@microsoft.graph.conflictBehavior=rename`, {
    parentReference: { id: idImportate },
  })
  return r.webUrl
}

/**
 * Rimette in arrivo dei file già spostati in "Importate" (per rifare l'import
 * di una fattura). Nomi esatti, maiuscole comprese. Restituisce i nomi spostati.
 */
export async function rimettiInArrivo(nomi: string[]): Promise<string[]> {
  const idImportate = await cartellaImportate()
  const arrivo = await graphGetOrNull<{ id: string }>(`${drive()}/root:/${percorso(cartellaSdi())}`)
  if (!arrivo) throw new Error(`Cartella "${cartellaSdi()}" non trovata`)
  const voci = await graphGetAll<any>(`${drive()}/items/${idImportate}/children?$select=id,name,file&$top=200`)
  const fatti: string[] = []
  for (const v of voci.filter((v) => v.file && nomi.includes(v.name))) {
    await graphPatch(`${drive()}/items/${v.id}`, { parentReference: { id: arrivo.id } })
    fatti.push(v.name)
  }
  return fatti
}

/** Salva il PDF allegato all'XML accanto al file, in "Importate". */
export async function salvaPdf(idImportate: string, nome: string, base64: string): Promise<string | null> {
  const dati = Buffer.from(base64, 'base64')
  if (dati.length === 0 || dati.length > 3_900_000) return null // upload semplice: sotto i 4 MB
  const pulito = nome.replace(/[\\/:*?"<>|#%]/g, '_')
  const r = await graphPutBinary<{ webUrl: string }>(
    `${drive()}/items/${idImportate}:/${encodeURIComponent(pulito)}:/content?@microsoft.graph.conflictBehavior=replace`,
    new Uint8Array(dati),
    'application/pdf',
  )
  return r.webUrl ?? null
}
