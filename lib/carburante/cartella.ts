/**
 * La cartella SharePoint dove Claudia carica ogni mese l'export delle carte
 * carburante IP. Sito dell'app (gruppo_ControlloGestione), libreria
 * Documenti, percorso da SP_CARTELLA_CARBURANTE (default
 * "General/schede carburante").
 *
 * I file NON si spostano dopo la lettura (a differenza delle fatture SDI):
 * Claudia li tiene lì come archivio e può correggerne uno e ricaricarlo.
 * Si rileggono quando cambia la data di modifica (tabella carburante_file).
 */

import { graphGetAll, graphGetBinary } from '@/lib/core/graph'
import { SITE } from '@/lib/core/sp'

export interface FileCarburante {
  id: string
  nome: string
  modificatoIl: string | null
  webUrl: string
}

export const cartellaCarburante = () => process.env.SP_CARTELLA_CARBURANTE || 'General/schede carburante'

const percorso = (p: string) => encodeURIComponent(p).replace(/%2F/g, '/')
const drive = () => `/sites/${SITE()}/drive`

/** I file Excel della cartella (.xls e .xlsx), senza sottocartelle. */
export async function elencaFileCarburante(): Promise<FileCarburante[]> {
  const voci = await graphGetAll<any>(
    `${drive()}/root:/${percorso(cartellaCarburante())}:/children?$select=id,name,file,webUrl,lastModifiedDateTime&$top=200`,
  )
  return voci
    .filter((v) => v.file && /\.xlsx?$/i.test(v.name ?? ''))
    .map((v) => ({ id: v.id, nome: v.name, modificatoIl: v.lastModifiedDateTime ?? null, webUrl: v.webUrl }))
}

export async function scaricaFileCarburante(id: string): Promise<Uint8Array> {
  return new Uint8Array(await graphGetBinary(`${drive()}/items/${id}/content`))
}
