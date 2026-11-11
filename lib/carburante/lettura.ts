/**
 * Da un file (.xls o .xlsx) ai rifornimenti, foglio per foglio. Puro: niente
 * database né SharePoint, così lo usa anche `scripts/prova-carburante.ts`.
 */

import { leggiFoglio } from '@/lib/pagamenti/xlsx'
import { leggiTracciato, type CentroNome, type Rifornimento } from './tracciato'
import { eXls, leggiXls } from './xls'

/** Legge un file (xls o xlsx) e restituisce i rifornimenti di tutti i fogli. */
export function rifornimentiDaFile(
  bytes: Uint8Array,
  nome: string,
  centri: CentroNome[],
): { rifornimenti: Rifornimento[]; avvisi: string[]; scartato: boolean } {
  const fogli: Array<{ nome: string; righe: (string | number | boolean | null)[][] }> = eXls(bytes)
    ? leggiXls(bytes)
    : [{ nome, righe: leggiFoglio(Buffer.from(bytes)) }]
  const rifornimenti: Rifornimento[] = []
  const avvisi: string[] = []
  let buoni = 0
  for (const f of fogli) {
    const e = leggiTracciato(f.righe, centri)
    if (e.scartato) {
      if (fogli.length === 1) avvisi.push(...e.avvisi)
      continue
    }
    buoni++
    rifornimenti.push(...e.rifornimenti)
    avvisi.push(...e.avvisi.map((a) => (fogli.length > 1 ? `${f.nome}: ${a}` : a)))
  }
  if (!buoni && fogli.length > 1) avvisi.push('nessun foglio con le colonne delle carte e del centro di costo')
  return { rifornimenti, avvisi, scartato: buoni === 0 }
}
