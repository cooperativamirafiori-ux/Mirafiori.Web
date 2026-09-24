/**
 * Comuni italiani — per compilare CAP e provincia da soli.
 *
 * L'elenco sta in `public/comuni.json` (lo rigenera `scripts/aggiorna-comuni.mjs`)
 * e lo scarica il browser una volta sola: la ricerca poi lavora in locale, come
 * quella dei clienti. Nessun import: lo usa il client.
 */

/** Una riga del file: nome, sigla della provincia, CAP del comune. */
export type Comune = [nome: string, sigla: string, cap: string[]]

/** Minuscole, senza accenti né apostrofi: «sant'ambrogio» trova «Sant'Ambrogio di Torino». */
function piatto(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * I comuni che cominciano con quello che si è scritto vengono prima di quelli
 * che lo contengono soltanto: scrivendo «tor» si vuole Torino, non Castelletto
 * Stura… A parità, prima i comuni con più CAP (le città), poi in ordine
 * alfabetico.
 */
export function cercaComuni(elenco: Comune[], query: string, max = 6): Comune[] {
  const q = piatto(query)
  if (q.length < 2) return []
  const inizio: Comune[] = []
  const dentro: Comune[] = []
  for (const c of elenco) {
    const n = piatto(c[0])
    if (n.startsWith(q)) inizio.push(c)
    else if (n.includes(` ${q}`)) dentro.push(c)
  }
  const perPeso = (a: Comune, b: Comune) =>
    b[2].length - a[2].length || a[0].localeCompare(b[0], 'it')
  return [...inizio.sort(perPeso), ...dentro.sort(perPeso)].slice(0, max)
}

/** Il comune con quel nome esatto (a meno di maiuscole e accenti), se c'è. */
export function trovaComune(elenco: Comune[], nome: string): Comune | undefined {
  const n = piatto(nome)
  return n ? elenco.find((c) => piatto(c[0]) === n) : undefined
}

/**
 * Come dire a voce i CAP di un comune: «10121» o «da 10121 a 10156».
 * Le città hanno decine di CAP, e il modulo non può scegliere al posto di chi
 * compila: può solo dire in che intervallo deve stare.
 */
export function descriviCap(c: Comune): string {
  const cap = c[2]
  if (cap.length <= 1) return cap[0] ?? ''
  return `da ${cap[0]} a ${cap[cap.length - 1]}`
}
