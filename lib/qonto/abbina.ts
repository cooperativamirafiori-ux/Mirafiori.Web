/**
 * Regole dell'abbinamento fra uscite Qonto e scadenze delle fatture.
 * Solo funzioni pure: niente database, niente Qonto. Così si provano da sole
 * (`scripts/prova-abbina-qonto.ts`) e la parte che legge e scrive resta un
 * travaso (riconciliazione.ts).
 *
 * Decise con Dennis il 1/11/2026 (docs/riconciliazione-qonto.md). Un
 * abbinamento è SICURO solo se tutte queste cose tornano:
 *   - stesso importo, al centesimo;
 *   - fornitore riconosciuto: IBAN della controparte, oppure una controparte
 *     già abbinata a mano a quel fornitore, oppure il nome — OPPURE stessa
 *     data di movimento e fattura (12/11/2026: «Carrefour» paga «GS S.p.A.»,
 *     il nome non torna ma importo al centesimo + stesso giorno bastano);
 *   - date vicine (da 45 giorni prima a 180 dopo la data della fattura);
 *   - un solo candidato da tutte e due le parti.
 * Fra più fatture dello stesso importo decide il centro di costo scritto in
 * fattura (Amazon), se coincide con il sottoconto. Se invece è diverso dal
 * sottoconto, quella coppia non è sicura: si fa a mano.
 *
 * Nel dubbio non si abbina: una fattura chiusa per sbaglio sparisce dalle
 * code, ed è peggio di una che aspetta un clic.
 */

export interface MovimentoDaAbbinare {
  id: string
  data: string                 // YYYY-MM-DD
  importo: number              // positivo
  ccCodice: string | null      // sottoconto; null = conto principale
  tipo: string | null          // card, transfer, direct_debit…
  controparte: string | null
  controparteIban: string | null
  etichetta: string | null
  completato: boolean
  soloAMano?: boolean
}

export interface ScadenzaCandidata {
  id: string
  fatturaId: string | null
  piva: string | null
  fornitore: string | null
  /** Data della fattura, o della scadenza se manca. */
  dataRif: string
  importo: number
  /** IBAN della scadenza (dalla fattura). */
  iban: string | null
  /** IBAN noto del fornitore. */
  ibanFornitore: string | null
  ccIndicato: string | null
  /** Vera = da chiudere; falsa = già pagata, solo da collegare al suo movimento. */
  aperta: boolean
}

export interface Controparte {
  chiave: string               // 'iban:…' | 'nome:…'
  piva: string                 // '' per 'ignora'
  azione: 'fornitore' | 'ignora'
}

export interface Abbinamento {
  movimentoId: string
  scadenzaIds: string[]
  come: 'singolo' | 'cumulativo'
  perche: string
}

// ------------------------------------------------------------------
// Pezzi
// ------------------------------------------------------------------

export const normIbanQ = (x: string | null | undefined) => (x ?? '').replace(/\s+/g, '').toUpperCase()

export function normNome(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const VUOTE = new Set([
  'srl', 'srls', 'spa', 'sas', 'snc', 'sarl', 'sal', 'ltd', 'gmbh', 'inc', 'llc', 'bv', 'nv', 'sa',
  'eu', 'europe', 'italia', 'italiana', 'italy', 'succursale', 'sede', 'secondaria', 'business',
  'societa', 'cooperativa', 'coop', 'sociale', 'onlus', 'impresa', 'ditta', 'della', 'delle', 'dei',
  'del', 'per', 'and', 'the', 'payments', 'payment', 'pay', 'mktp', 'marketplace', 'www', 'com',
  'shop', 'store', 'online', 'services', 'service', 'group', 'gruppo', 'unipersonale', 'uninominale',
  'servizi', 'impianti', 'commerciale', 'tecnica', 'sistemi', 'soluzioni', 'centro', 'studio', 'nord',
  'sud', 'torino', 'milano', 'roma', 'piemonte', 'italiane', 'italiani', 'generale', 'societ',
])

/** Le parole che riconoscono un nome: almeno 3 lettere, niente forme societarie. */
export function parole(s: string | null | undefined): string[] {
  return normNome(s).split(' ').filter((p) => p.length >= 3 && !VUOTE.has(p) && !/^\d+$/.test(p))
}

function stessaParola(a: string, b: string): boolean {
  if (a === b) return true
  // "esselunga" / "esselungaspa", "leroy" / "leroymerlin": prefisso lungo almeno 5
  const [corta, lunga] = a.length <= b.length ? [a, b] : [b, a]
  return corta.length >= 5 && lunga.startsWith(corta)
}

export const chiaveIban = (iban: string) => `iban:${normIbanQ(iban)}`
export const chiaveNome = (nome: string) => `nome:${normNome(nome)}`

/** Le chiavi con cui un movimento si cerca fra le controparti imparate. */
export function chiaviMovimento(m: Pick<MovimentoDaAbbinare, 'controparteIban' | 'controparte' | 'etichetta'>): string[] {
  const k: string[] = []
  if (m.controparteIban) k.push(chiaveIban(m.controparteIban))
  if (normNome(m.controparte)) k.push(chiaveNome(m.controparte!))
  if (normNome(m.etichetta) && normNome(m.etichetta) !== normNome(m.controparte)) k.push(chiaveNome(m.etichetta!))
  return k
}

export const stessoImporto = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100)

const giorni = (da: string, a: string) => Math.round((Date.parse(a) - Date.parse(da)) / 86_400_000)

/** Il movimento cade fra 45 giorni prima e 180 dopo la data della fattura. */
export const inFinestra = (m: Pick<MovimentoDaAbbinare, 'data'>, c: Pick<ScadenzaCandidata, 'dataRif'>) => {
  const d = giorni(c.dataRif, m.data)
  return d >= -45 && d <= 180
}

export type Riconoscimento = 'iban' | 'imparato' | 'nome' | null

export function indice(controparti: Controparte[]) {
  const fornitori = new Map<string, Set<string>>()
  const ignora = new Set<string>()
  for (const c of controparti) {
    if (c.azione === 'ignora') ignora.add(c.chiave)
    else if (c.piva) fornitori.set(c.chiave, (fornitori.get(c.chiave) ?? new Set()).add(c.piva))
  }
  return { fornitori, ignora }
}
export type Indice = ReturnType<typeof indice>

/** Movimento e fattura dello stesso giorno (regola del 12/11/2026). */
export const stessaData = (m: Pick<MovimentoDaAbbinare, 'data'>, c: Pick<ScadenzaCandidata, 'dataRif'>) => m.data === c.dataRif

/** Come il movimento riconosce il fornitore di quella scadenza (null = non lo riconosce). */
export function riconosce(m: MovimentoDaAbbinare, c: ScadenzaCandidata, idx: Indice): Riconoscimento {
  const ibanM = normIbanQ(m.controparteIban)
  if (ibanM && (ibanM === normIbanQ(c.iban) || ibanM === normIbanQ(c.ibanFornitore))) return 'iban'
  if (c.piva && chiaviMovimento(m).some((k) => idx.fornitori.get(k)?.has(c.piva!))) return 'imparato'
  const pm = [...parole(m.controparte), ...parole(m.etichetta)]
  const pf = parole(c.fornitore)
  if (pm.some((a) => pf.some((b) => stessaParola(a, b)))) return 'nome'
  return null
}

export const daIgnorare = (m: MovimentoDaAbbinare, idx: Indice) => chiaviMovimento(m).some((k) => idx.ignora.has(k))

/**
 * Le scadenze che quel movimento potrebbe pagare, già con il filtro del centro
 * di costo: una fattura che indica un CC diverso dal sottoconto della carta
 * non è mai un candidato sicuro.
 */
function candidatiSicuri(m: MovimentoDaAbbinare, cs: ScadenzaCandidata[], idx: Indice): ScadenzaCandidata[] {
  let l = cs.filter((c) => stessoImporto(m.importo, c.importo) && inFinestra(m, c) && (riconosce(m, c, idx) !== null || stessaData(m, c)))
  if (m.ccCodice) {
    l = l.filter((c) => !c.ccIndicato || c.ccIndicato === m.ccCodice)
    const conCc = l.filter((c) => c.ccIndicato === m.ccCodice)
    if (l.length > 1 && conCc.length >= 1) l = conCc
  }
  return l
}

/** Combinazioni esatte di 2+ scadenze che fanno l'importo (al massimo 12 scadenze). */
function combinazioni(importo: number, cs: ScadenzaCandidata[]): ScadenzaCandidata[][] {
  const lista = cs.slice(0, 12)
  const obiettivo = Math.round(importo * 100)
  const trovate: ScadenzaCandidata[][] = []
  const n = lista.length
  for (let mask = 1; mask < 1 << n; mask++) {
    let somma = 0
    let quante = 0
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { somma += Math.round(lista[i].importo * 100); quante++ }
    if (quante >= 2 && somma === obiettivo) {
      trovate.push(lista.filter((_, i) => mask & (1 << i)))
      if (trovate.length > 1) break // ne basta una seconda per dire "ambiguo"
    }
  }
  return trovate
}

// ------------------------------------------------------------------
// L'abbinamento automatico
// ------------------------------------------------------------------

export function abbina(movimenti: MovimentoDaAbbinare[], candidate: ScadenzaCandidata[], controparti: Controparte[]): {
  abbinamenti: Abbinamento[]
  ignorati: string[]
} {
  const idx = indice(controparti)
  const ignorati: string[] = []
  const attivi: MovimentoDaAbbinare[] = []
  for (const m of movimenti) {
    if (daIgnorare(m, idx)) ignorati.push(m.id)
    else if (m.completato && !m.soloAMano) attivi.push(m)
  }

  const perMov = new Map<string, ScadenzaCandidata[]>()
  const perScad = new Map<string, string[]>()
  for (const m of attivi) {
    const l = candidatiSicuri(m, candidate, idx)
    perMov.set(m.id, l)
    for (const c of l) perScad.set(c.id, [...(perScad.get(c.id) ?? []), m.id])
  }

  const abbinamenti: Abbinamento[] = []
  const usate = new Set<string>()

  // 1. Coppie uniche da tutte e due le parti.
  for (const m of attivi) {
    const l = perMov.get(m.id)!
    if (l.length !== 1) continue
    const c = l[0]
    if ((perScad.get(c.id) ?? []).length !== 1 || usate.has(c.id)) continue
    usate.add(c.id)
    const r = riconosce(m, c, idx)
    abbinamenti.push({
      movimentoId: m.id,
      scadenzaIds: [c.id],
      come: 'singolo',
      perche: (r === null
        ? 'stesso importo e stessa data'
        : `stesso importo, fornitore riconosciuto ${r === 'iban' ? 'dall’IBAN' : r === 'imparato' ? 'da un abbinamento precedente' : 'dal nome'}`)
        + (m.ccCodice && c.ccIndicato === m.ccCodice ? `, centro di costo ${m.ccCodice} in fattura` : ''),
    })
  }

  // 2. Bonifici cumulativi: solo con l'IBAN, solo se una sola combinazione torna,
  //    e solo con scadenze aperte che nessun altro movimento reclama.
  const fatti = new Set(abbinamenti.map((a) => a.movimentoId))
  for (const m of attivi) {
    if (fatti.has(m.id) || (perMov.get(m.id) ?? []).length > 0 || !m.controparteIban) continue
    const stesse = candidate.filter(
      (c) => c.aperta && !usate.has(c.id) && !perScad.has(c.id) && inFinestra(m, c) && riconosce(m, c, idx) === 'iban',
    )
    if (stesse.length < 2 || stesse.length > 12) continue
    const comb = combinazioni(m.importo, stesse)
    if (comb.length !== 1) continue
    for (const c of comb[0]) usate.add(c.id)
    abbinamenti.push({
      movimentoId: m.id,
      scadenzaIds: comb[0].map((c) => c.id),
      come: 'cumulativo',
      perche: `bonifico cumulativo: ${comb[0].length} fatture dello stesso IBAN fanno esattamente l’importo`,
    })
  }

  return { abbinamenti, ignorati }
}

// ------------------------------------------------------------------
// Per le persone: candidati da mostrare, compatibilità prima dell'invio
// ------------------------------------------------------------------

/** Le scadenze da proporre per un abbinamento a mano, le più probabili prima. */
export function candidatiManuali(m: MovimentoDaAbbinare, cs: ScadenzaCandidata[], controparti: Controparte[], quanti = 8) {
  const idx = indice(controparti)
  return cs
    .map((c) => {
      const importo = stessoImporto(m.importo, c.importo)
      const forn = riconosce(m, c, idx)
      const vicino = inFinestra(m, c)
      const punti = (importo ? 4 : 0) + (forn ? 3 : 0) + (vicino ? 1 : 0) + (m.ccCodice && c.ccIndicato === m.ccCodice ? 1 : 0)
      return { c, punti, importo, forn, vicino, distanza: Math.abs(giorni(c.dataRif, m.data)) }
    })
    .filter((x) => (x.importo && x.vicino) || x.forn)
    .sort((a, b) => b.punti - a.punti || a.distanza - b.distanza)
    .slice(0, quanti)
    .map((x) => ({ id: x.c.id, stessoImporto: x.importo, fornitoreRiconosciuto: x.forn }))
}

/**
 * Prima di inviare un bonifico: c'è già su Qonto un'uscita non abbinata che
 * sembra proprio questa? Stesso importo e stesso fornitore (anche solo dal
 * nome), date compatibili. Qui si contano anche i movimenti in attesa.
 */
export function giaSuQonto(c: ScadenzaCandidata, movimenti: MovimentoDaAbbinare[], controparti: Controparte[]): MovimentoDaAbbinare | null {
  const idx = indice(controparti)
  return movimenti.find((m) => stessoImporto(m.importo, c.importo) && inFinestra(m, c) && riconosce(m, c, idx) !== null) ?? null
}

/**
 * Il centro di costo scritto in fattura (Amazon lo mette nella causale o nel
 * numero d'ordine): "cc18", "CC 18", "cc-18". Uno solo, altrimenti null.
 * Non prende "c/c" (conto corrente) né numeri di carta ("CC 123456").
 */
export function ccDaTesti(testi: Array<string | null | undefined>): string | null {
  const trovati = new Set<string>()
  const re = /(?:^|[^a-z0-9/])cc\s*[-_.:#]?\s*(\d{1,2})(?!\d)/gi
  for (const t of testi) {
    if (!t) continue
    for (const m of t.matchAll(re)) {
      const n = Number(m[1])
      if (n > 0) trovati.add(`cc${n}`)
    }
  }
  return trovati.size === 1 ? [...trovati][0] : null
}
