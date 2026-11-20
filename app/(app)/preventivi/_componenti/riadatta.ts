/**
 * Quando cambiano servizio, ente o sottotipo, le voci già scritte si
 * riportano alle tariffe nuove: stessa voce, prezzo di quell'ente (es. gli
 * accompagnamenti passano da 23 a 28 € se l'ente non è più Torino). Le voci
 * che non esistono più si tolgono e si dice quali. Se non c'è nessuna retta,
 * si mettono quelle automatiche (le due quote di Torino, o la retta unica).
 *
 * Funzione pura: la usa EditorPreventivo e si prova senza schermata.
 */

import { SUFFISSO_INDIRETTO, type RigaPreventivo, type Tariffa } from '@/types/preventivi'
import { retteAutomatiche, rigaDaTariffa } from '@/lib/preventivi/calcoli'

export function riadatta(righe: RigaPreventivo[], voci: Tariffa[]): { righe: RigaPreventivo[]; tolte: string[] } {
  const tolte: string[] = []
  const nuove: RigaPreventivo[] = []
  const codici = new Map<string, string>()
  for (const r of righe) {
    if (r.codice.endsWith(SUFFISSO_INDIRETTO)) continue
    const t = voci.find((x) => x.codice === r.codice) ?? voci.find((x) => x.voce.toLowerCase() === r.voce.toLowerCase())
    if (!t) {
      tolte.push(r.voce)
      continue
    }
    codici.set(r.codice, t.codice)
    nuove.push(
      t.codice === r.codice
        ? r
        : { ...r, codice: t.codice, voce: t.voce, gruppo: t.gruppo, unita: t.unita, iva: t.iva, prezzo: t.prezzo ?? r.prezzo },
    )
  }
  // Il lavoro indiretto segue il suo costo orario.
  for (const r of righe.filter((x) => x.codice.endsWith(SUFFISSO_INDIRETTO))) {
    const base = codici.get(r.codice.slice(0, -SUFFISSO_INDIRETTO.length))
    const b = base && nuove.find((x) => x.codice === base)
    if (b) nuove.push({ ...r, codice: `${b.codice}${SUFFISSO_INDIRETTO}`, prezzo: b.prezzo, iva: b.iva })
  }
  if (!nuove.some((r) => r.gruppo === 'Retta')) {
    const rette = retteAutomatiche(voci).filter((t) => !nuove.some((r) => r.codice === t.codice))
    nuove.unshift(...rette.map(rigaDaTariffa))
  }
  return { righe: nuove, tolte }
}

/** Il prezzo del lavoro indiretto resta uguale a quello del suo costo orario. */
export function allineaIndiretto(righe: RigaPreventivo[]): RigaPreventivo[] {
  return righe.map((r) => {
    if (!r.codice.endsWith(SUFFISSO_INDIRETTO)) return r
    const b = righe.find((x) => x.codice === r.codice.slice(0, -SUFFISSO_INDIRETTO.length))
    return b && b.prezzo !== r.prezzo ? { ...r, prezzo: b.prezzo } : r
  })
}
