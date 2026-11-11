/**
 * Lettore minimo dei file Excel 97-2003 (.xls, BIFF8 dentro un contenitore
 * OLE/CFB), quelli che il portale IP fa scaricare per le schede carburante.
 *
 * Nostro e senza librerie, come il lettore .xlsx di Fattura SMART
 * (lib/pagamenti/xlsx.ts) e la busta p7m delle fatture SDI: le librerie che
 * leggono .xls sono pesanti e quella diffusa su npm è ferma a una versione con
 * problemi noti. Qui serve solo il valore delle celle, niente formati.
 *
 * Restituisce, foglio per foglio, una griglia di valori: stringa, numero,
 * booleano o null. Le date restano quello che sono nel file: testo se il
 * portale le scrive come testo, numero seriale Excel se sono date vere — le
 * interpreta chi legge il tracciato.
 */

export type Cella = string | number | boolean | null

export interface FoglioXls {
  nome: string
  righe: Cella[][]
}

const FINE_CATENA = 0xfffffffe
const LIBERO = 0xffffffff

/** Firma del contenitore OLE: D0 CF 11 E0 A1 B1 1A E1. */
export function eXls(b: Uint8Array): boolean {
  const firma = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  return b.length > 512 && firma.every((x, i) => b[i] === x)
}

// ---------------------------------------------------------------------------
// Contenitore CFB: trova lo stream "Workbook"
// ---------------------------------------------------------------------------

function streamWorkbook(b: Uint8Array): Uint8Array {
  if (!eXls(b)) throw new Error('Non è un file Excel 97-2003 (.xls)')
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const u32 = (o: number) => dv.getUint32(o, true)
  const dimSettore = 1 << dv.getUint16(0x1e, true)
  const dimMini = 1 << dv.getUint16(0x20, true)
  const primoDir = u32(0x30)
  const sogliaMini = u32(0x38)
  const primoMiniFat = u32(0x3c)
  let settoreDifat = u32(0x44)
  const nDifat = u32(0x48)

  const settore = (n: number) => {
    const da = (n + 1) * dimSettore
    if (da + dimSettore > b.length) throw new Error('File .xls troncato')
    return b.subarray(da, da + dimSettore)
  }

  // Elenco dei settori che compongono la FAT: 109 nell'intestazione, il resto
  // nella catena DIFAT.
  const settoriFat: number[] = []
  for (let i = 0; i < 109; i++) {
    const s = u32(0x4c + i * 4)
    if (s !== LIBERO && s !== FINE_CATENA) settoriFat.push(s)
  }
  for (let k = 0; k < nDifat && settoreDifat !== FINE_CATENA && settoreDifat !== LIBERO; k++) {
    const blocco = settore(settoreDifat)
    const bv = new DataView(blocco.buffer, blocco.byteOffset, blocco.byteLength)
    const per = dimSettore / 4 - 1
    for (let i = 0; i < per; i++) {
      const s = bv.getUint32(i * 4, true)
      if (s !== LIBERO && s !== FINE_CATENA) settoriFat.push(s)
    }
    settoreDifat = bv.getUint32(per * 4, true)
  }
  const fat: number[] = []
  for (const s of settoriFat) {
    const blocco = settore(s)
    const bv = new DataView(blocco.buffer, blocco.byteOffset, blocco.byteLength)
    for (let i = 0; i < dimSettore / 4; i++) fat.push(bv.getUint32(i * 4, true))
  }

  const catena = (primo: number, tabella: number[]): number[] => {
    const out: number[] = []
    const visti = new Set<number>()
    for (let s = primo; s !== FINE_CATENA && s !== LIBERO; s = tabella[s]) {
      if (visti.has(s) || s >= tabella.length) throw new Error('File .xls rovinato (catena dei settori)')
      visti.add(s)
      out.push(s)
    }
    return out
  }
  const leggiGrande = (primo: number, dim: number): Uint8Array => {
    const out = new Uint8Array(catena(primo, fat).length * dimSettore)
    catena(primo, fat).forEach((s, i) => out.set(settore(s), i * dimSettore))
    return out.subarray(0, dim)
  }

  // Directory: voci da 128 byte.
  const dir = leggiGrande(primoDir, catena(primoDir, fat).length * dimSettore)
  const dd = new DataView(dir.buffer, dir.byteOffset, dir.byteLength)
  interface Voce {
    nome: string
    tipo: number
    inizio: number
    dim: number
  }
  const voci: Voce[] = []
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const lung = dd.getUint16(o + 0x40, true)
    let nome = ''
    for (let i = 0; i + 2 < lung; i += 2) nome += String.fromCharCode(dd.getUint16(o + i, true))
    voci.push({ nome, tipo: dir[o + 0x42], inizio: dd.getUint32(o + 0x74, true), dim: dd.getUint32(o + 0x78, true) })
  }
  const radice = voci.find((v) => v.tipo === 5)
  const wb = voci.find((v) => v.tipo === 2 && (v.nome === 'Workbook' || v.nome === 'Book'))
  if (!wb) throw new Error('Nel file .xls non c\'è il foglio di lavoro (stream Workbook)')
  if (wb.nome === 'Book') throw new Error('File Excel 5/95: formato troppo vecchio, salvalo come .xlsx')
  if (wb.dim >= sogliaMini) return leggiGrande(wb.inizio, wb.dim)

  // Stream piccolo: sta nel "mini stream" della radice.
  if (!radice) throw new Error('File .xls rovinato (manca la radice)')
  const mini = leggiGrande(radice.inizio, radice.dim)
  const miniFat: number[] = []
  for (const s of catena(primoMiniFat, fat)) {
    const blocco = settore(s)
    const bv = new DataView(blocco.buffer, blocco.byteOffset, blocco.byteLength)
    for (let i = 0; i < dimSettore / 4; i++) miniFat.push(bv.getUint32(i * 4, true))
  }
  const pezzi = catena(wb.inizio, miniFat)
  const out = new Uint8Array(pezzi.length * dimMini)
  pezzi.forEach((s, i) => out.set(mini.subarray(s * dimMini, (s + 1) * dimMini), i * dimMini))
  return out.subarray(0, wb.dim)
}

// ---------------------------------------------------------------------------
// BIFF8
// ---------------------------------------------------------------------------

interface Record {
  tipo: number
  dati: Uint8Array
  /** Posizione dell'intestazione del record nello stream. */
  pos: number
}

function records(s: Uint8Array): Record[] {
  const out: Record[] = []
  const dv = new DataView(s.buffer, s.byteOffset, s.byteLength)
  for (let o = 0; o + 4 <= s.length; ) {
    const tipo = dv.getUint16(o, true)
    const lung = dv.getUint16(o + 2, true)
    if (o + 4 + lung > s.length) break
    out.push({ tipo, dati: s.subarray(o + 4, o + 4 + lung), pos: o })
    o += 4 + lung
  }
  return out
}

const latin1 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return s
}
const utf16 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b[i] | (b[i + 1] << 8))
  return s
}

/**
 * Legge le stringhe della SST, che possono spezzarsi su più record CONTINUE:
 * quando una stringa a metà passa al record successivo, quel record comincia
 * con un byte di flag che dice se i caratteri seguenti sono a 8 o 16 bit.
 */
function leggiSst(pezzi: Uint8Array[]): string[] {
  let p = 0
  let o = 0
  const out: string[] = []
  const avanti = () => {
    if (o >= pezzi[p].length && p + 1 < pezzi.length) {
      p++
      o = 0
    }
  }
  const byte = () => {
    avanti()
    return pezzi[p][o++]
  }
  const u16 = () => byte() | (byte() << 8)
  const u32 = () => (u16() | (u16() << 16)) >>> 0
  const salta = (n: number) => {
    while (n > 0) {
      avanti()
      const q = Math.min(n, pezzi[p].length - o)
      if (q <= 0) return
      o += q
      n -= q
    }
  }
  if (!pezzi.length || pezzi[0].length < 8) return out
  o = 4 // cstTotal
  const quante = u32()
  for (let i = 0; i < quante; i++) {
    if (p >= pezzi.length || (p === pezzi.length - 1 && o >= pezzi[p].length)) break
    const cch = u16()
    let flag = byte()
    const ricca = flag & 0x08 ? u16() : 0
    const ext = flag & 0x04 ? u32() : 0
    let s = ''
    let resto = cch
    while (resto > 0) {
      if (o >= pezzi[p].length) {
        if (p + 1 >= pezzi.length) break
        p++
        o = 0
        flag = pezzi[p][o++] // nuovo flag a inizio CONTINUE
      }
      const larga = (flag & 0x01) === 1
      const disp = Math.floor((pezzi[p].length - o) / (larga ? 2 : 1))
      const n = Math.min(resto, disp)
      if (n <= 0) {
        o = pezzi[p].length
        continue
      }
      const pezzo = pezzi[p].subarray(o, o + n * (larga ? 2 : 1))
      s += larga ? utf16(pezzo) : latin1(pezzo)
      o += pezzo.length
      resto -= n
    }
    salta(ricca * 4 + ext)
    out.push(s)
  }
  return out
}

/** XLUnicodeString (LABEL, STRING): cch a 16 bit, flag, caratteri. */
function stringaCorta(d: Uint8Array, da: number): string {
  const cch = d[da] | (d[da + 1] << 8)
  const larga = (d[da + 2] & 0x01) === 1
  const inizio = da + 3
  return larga ? utf16(d.subarray(inizio, inizio + cch * 2)) : latin1(d.subarray(inizio, inizio + cch))
}

function rk(v: number): number {
  let n: number
  if (v & 0x02) {
    n = v >> 2 // intero con segno a 30 bit
  } else {
    const buf = new DataView(new ArrayBuffer(8))
    buf.setUint32(4, v & 0xfffffffc, true)
    buf.setUint32(0, 0, true)
    n = buf.getFloat64(0, true)
  }
  return v & 0x01 ? n / 100 : n
}

/** Legge tutti i fogli di un .xls. */
export function leggiXls(file: Uint8Array): FoglioXls[] {
  const wb = streamWorkbook(file)
  const tutti = records(wb)

  // Globali: elenco fogli e SST.
  const fogli: Array<{ nome: string; pos: number }> = []
  let sst: string[] = []
  for (let i = 0; i < tutti.length; i++) {
    const r = tutti[i]
    if (r.tipo === 0x0085) {
      const d = r.dati
      const pos = (d[0] | (d[1] << 8) | (d[2] << 16) | (d[3] << 24)) >>> 0
      const tipoFoglio = d[5] // 0 = foglio di lavoro
      const cch = d[6]
      const larga = (d[7] & 0x01) === 1
      const nome = larga ? utf16(d.subarray(8, 8 + cch * 2)) : latin1(d.subarray(8, 8 + cch))
      if (tipoFoglio === 0) fogli.push({ nome, pos })
    } else if (r.tipo === 0x00fc) {
      const pezzi = [r.dati]
      for (let j = i + 1; j < tutti.length && tutti[j].tipo === 0x003c; j++) pezzi.push(tutti[j].dati)
      sst = leggiSst(pezzi)
    } else if (r.tipo === 0x0809 && i > 0 && fogli.length > 0) {
      break // inizio del primo foglio: finiti i globali
    }
  }

  const indice = new Map(tutti.map((r, i) => [r.pos, i]))
  return fogli.map(({ nome, pos }) => {
    const righe: Cella[][] = []
    const metti = (r: number, c: number, v: Cella) => {
      while (righe.length <= r) righe.push([])
      const riga = righe[r]
      while (riga.length <= c) riga.push(null)
      riga[c] = v
    }
    const inizio = indice.get(pos)
    if (inizio === undefined) return { nome, righe }
    let attesaStringa: { r: number; c: number } | null = null
    for (let i = inizio + 1; i < tutti.length; i++) {
      const { tipo, dati: d } = tutti[i]
      if (tipo === 0x000a) break // EOF del foglio
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
      const r = d.length >= 4 ? dv.getUint16(0, true) : 0
      const c = d.length >= 4 ? dv.getUint16(2, true) : 0
      switch (tipo) {
        case 0x00fd: // LABELSST
          metti(r, c, sst[dv.getUint32(6, true)] ?? '')
          break
        case 0x0203: // NUMBER
          metti(r, c, dv.getFloat64(6, true))
          break
        case 0x027e: // RK
          metti(r, c, rk(dv.getUint32(6, true)))
          break
        case 0x00bd: {
          // MULRK
          const ultima = dv.getUint16(d.length - 2, true)
          for (let k = 0; c + k <= ultima; k++) metti(r, c + k, rk(dv.getUint32(4 + k * 6 + 2, true)))
          break
        }
        case 0x0204: // LABEL
          metti(r, c, stringaCorta(d, 6))
          break
        case 0x0205: // BOOLERR
          metti(r, c, d[7] === 0 ? d[6] === 1 : null)
          break
        case 0x0006: {
          // FORMULA: il valore già calcolato
          if (dv.getUint16(12, true) === 0xffff) {
            const t = d[6]
            if (t === 0) attesaStringa = { r, c }
            else if (t === 1) metti(r, c, d[8] === 1)
            else metti(r, c, null)
          } else {
            metti(r, c, dv.getFloat64(6, true))
          }
          break
        }
        case 0x0207: // STRING (risultato della FORMULA precedente)
          if (attesaStringa) metti(attesaStringa.r, attesaStringa.c, stringaCorta(d, 0))
          attesaStringa = null
          break
      }
    }
    return { nome, righe }
  })
}
