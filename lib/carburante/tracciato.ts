/**
 * Dalle righe di un file mensile delle carte carburante IP ai rifornimenti.
 * Funzioni pure: nessun accesso a SharePoint o al database.
 *
 * Il portale IP ha usato due tracciati nel 2026, e Claudia aggiunge a mano la
 * colonna del centro di costo (scritta a volte "CENTRO DI CSOTO"):
 *
 *  - inglese (gennaio-giugno, agosto-ottobre): `Id`, `DataTransazione`,
 *    `NrPan`, `ImportoFinaleFatturatoSIVA`, `NumeroFattura`, `ProtocolNumber`…
 *  - italiano (luglio): `Data transazione`, `Pan Carta`, `Importo fatturato
 *    IVA esclusa`, `Numero fattura`, `Numero di protocollo`… e niente `Id`.
 *
 * Per questo le colonne si cercano per nome (normalizzato) e la chiave del
 * rifornimento è il **numero di protocollo** della transazione, che c'è in
 * tutti e due e non si ripete.
 */

export interface Rifornimento {
  protocollo: string
  data: string // ISO yyyy-mm-dd
  ora: string | null
  carta: string | null
  targa: string | null
  /** Il valore come scritto nel file ("CC9", "ED. NORD"). */
  ccFile: string | null
  /** Il codice riconosciuto (cc9), null se non si capisce. */
  cc: string | null
  prodotto: string | null
  litri: number | null
  /** Importo alla pompa, IVA compresa. */
  importo: number | null
  /** Importo fatturato IVA esclusa: è quello che si divide. */
  imponibile: number
  numeroFattura: string | null
  dataFattura: string | null
}

export interface CentroNome {
  codice: string
  nome: string
}

export interface EsitoTracciato {
  rifornimenti: Rifornimento[]
  /** Messaggi per chi carica: colonne mancanti, centri di costo non capiti. */
  avvisi: string[]
  /** Vero se il foglio non è un export delle carte (manca qualcosa di essenziale). */
  scartato: boolean
}

type Cella = string | number | boolean | null

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const COLONNE: Record<string, string[]> = {
  protocollo: ['protocolnumber', 'numerodiprotocollo'],
  data: ['datatransazione'],
  ora: ['oratransazione'],
  carta: ['nrpan', 'pancarta'],
  targa: ['targa'],
  prodotto: ['descrizioneprodotto'],
  litri: ['quantita'],
  importo: ['importo'],
  imponibile: ['importofinalefatturatosiva', 'importofatturatoivaesclusa'],
  numeroFattura: ['numerofattura'],
  dataFattura: ['datafattura'],
  segno: ['segno', 'tipologiatransazione'],
}

/** La colonna del centro di costo: "CENTRO DI COSTO", "CENTRO DI CSOTO", "CdC"… */
const eColonnaCc = (h: string) => h.startsWith('centrodic') || h === 'cdc' || h === 'cc' || h === 'centrocosto'

/** Numero da cella: 39.43, "39,430", "1.234,50". */
export function numero(v: Cella): number | null {
  if (v === null || v === '' || typeof v === 'boolean') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = v.trim().replace(/\s/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Data da cella: seriale Excel (46055) o testo "02/01/2026" / "2026-01-02". */
export function data(v: Cella): string | null {
  if (v === null || v === '' || typeof v === 'boolean') return null
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000
    return new Date(ms).toISOString().slice(0, 10)
  }
  const s = v.trim()
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

const testo = (v: Cella): string | null => {
  if (v === null || typeof v === 'boolean') return null
  const s = String(v).trim()
  return s ? s : null
}

/** Ora: "18:36:00" o frazione di giorno. */
const ora = (v: Cella): string | null => {
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const min = Math.round(v * 1440)
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
  }
  const s = testo(v)
  return s ? s.slice(0, 5) : null
}

/** Numeri lunghi che Excel può aver salvato come numero (protocollo, fattura). */
const codice = (v: Cella): string | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v)) : null
  return testo(v)
}

/**
 * Riconosce il centro di costo scritto nel file: "CC9" / "cc 9" → cc9; oppure
 * per nome, quando tutte le parole del valore stanno nel nome di UN solo
 * centro ("GIULIA" → CER Giulia, "ED. NORD" → Ed. amb. Nord).
 */
export function riconosciCc(valore: string | null, centri: CentroNome[]): string | null {
  if (!valore) return null
  const m = valore.trim().match(/^cc\s*0*(\d{1,3})$/i)
  if (m) {
    const c = `cc${m[1]}`
    return centri.some((x) => x.codice === c) ? c : null
  }
  const parole = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  const cerca = parole(valore)
  if (!cerca.length) return null
  const trovati = centri.filter((c) => {
    if (c.codice === 'DA_ATTRIBUIRE') return false
    const nome = parole(c.nome)
    return cerca.every((p) => nome.includes(p))
  })
  return trovati.length === 1 ? trovati[0].codice : null
}

const arrot = (n: number) => Math.round(n * 100) / 100

/** Legge un foglio: cerca la riga d'intestazione fra le prime dieci. */
export function leggiTracciato(righe: Cella[][], centri: CentroNome[]): EsitoTracciato {
  const avvisi: string[] = []
  let iTesta = -1
  let pos: Record<string, number> = {}
  let iCc = -1
  for (let r = 0; r < Math.min(10, righe.length); r++) {
    const h = (righe[r] ?? []).map(norm)
    const p: Record<string, number> = {}
    for (const [campo, nomi] of Object.entries(COLONNE)) {
      const i = h.findIndex((x) => nomi.includes(x))
      if (i >= 0) p[campo] = i
    }
    if (p.protocollo !== undefined && p.imponibile !== undefined && p.data !== undefined) {
      iTesta = r
      pos = p
      iCc = h.findIndex(eColonnaCc)
      break
    }
  }
  if (iTesta < 0) {
    return { rifornimenti: [], avvisi: ['non sembra un export delle carte carburante (mancano le colonne)'], scartato: true }
  }
  if (iCc < 0) {
    return { rifornimenti: [], avvisi: ['manca la colonna CENTRO DI COSTO'], scartato: true }
  }

  const val = (riga: Cella[], campo: string): Cella => (pos[campo] === undefined ? null : (riga[pos[campo]] ?? null))
  const nonCapiti = new Map<string, number>()
  const senzaCc: string[] = []
  const out: Rifornimento[] = []
  const visti = new Set<string>()

  for (const riga of righe.slice(iTesta + 1)) {
    if (!riga || riga.every((c) => c === null || c === '')) continue
    const protocollo = codice(val(riga, 'protocollo'))
    const giorno = data(val(riga, 'data'))
    const imp = numero(val(riga, 'imponibile'))
    if (!protocollo || !giorno || imp === null) continue // righe di totale o vuote
    if (visti.has(protocollo)) continue
    visti.add(protocollo)

    const storno = testo(val(riga, 'segno')) === '-'
    const segno = (n: number | null) => (n === null ? null : storno && n > 0 ? -n : n)
    const ccFile = testo(riga[iCc] ?? null)
    const cc = riconosciCc(ccFile, centri)
    if (!ccFile) senzaCc.push(protocollo)
    else if (!cc) nonCapiti.set(ccFile, (nonCapiti.get(ccFile) ?? 0) + 1)

    const nf = codice(val(riga, 'numeroFattura'))
    out.push({
      protocollo,
      data: giorno,
      ora: ora(val(riga, 'ora')),
      carta: codice(val(riga, 'carta')),
      targa: testo(val(riga, 'targa')),
      ccFile,
      cc,
      prodotto: testo(val(riga, 'prodotto')),
      litri: segno(numero(val(riga, 'litri'))),
      importo: segno(numero(val(riga, 'importo'))),
      imponibile: arrot(segno(imp) ?? 0),
      numeroFattura: nf && /^0+$/.test(nf) ? null : nf,
      dataFattura: data(val(riga, 'dataFattura')),
    })
  }

  if (senzaCc.length) avvisi.push(`${senzaCc.length} rifornimenti senza centro di costo`)
  for (const [v, n] of nonCapiti) avvisi.push(`centro di costo "${v}" non riconosciuto (${n} rifornimenti)`)
  return { rifornimenti: out, avvisi, scartato: false }
}
