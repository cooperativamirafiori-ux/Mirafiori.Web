/**
 * Lettore .xlsx minimale, scritto apposta per gli export di Fattura SMART.
 *
 * ## Perché non exceljs
 *
 * exceljs è nel progetto e va benissimo per *scrivere* (export RU, foglio ore).
 * In lettura però pretende un pacchetto a norma, e l'export di Fattura SMART
 * non lo è. Sul file del 01/09/2026:
 *
 *   - `sharedStrings.xml` e `styles.xml` usano il prefisso di namespace `x:`
 *     (`<x:sst>`, `<x:styleSheet>`) → exceljs si ferma su «Unexpected xml node»;
 *   - le celle non hanno il riferimento (`<c>` senza `r="B5"`): la posizione è
 *     data solo dall'ordine;
 *   - `[Content_Types].xml` dichiara `docProps/app.xml`, che nel file non c'è;
 *   - `sst count="1"` mentre le stringhe sono due.
 *
 * Sistemare il pacchetto per darlo in pasto a exceljs vorrebbe dire
 * decomprimerlo e ricomprimerlo a ogni import — più codice di questo file, e
 * comunque alla mercé della prossima stranezza del gestionale.
 *
 * ## Cosa fa questo
 *
 * Legge lo zip (solo `inflateRaw` di Node, nessuna dipendenza), normalizza i
 * prefissi di namespace e trasforma il foglio in una griglia di valori grezzi:
 * stringhe e numeri, niente stili. **Le date restano numeri**: è chi conosce
 * il significato delle colonne a convertirle (`aData` in `tracciato.ts`), e
 * così non dipendiamo dal foglio degli stili, che è la parte più malmessa.
 *
 * Non gestisce: formule (si legge il risultato memorizzato), zip64, file
 * protetti. Per un export di duemila righe non servono.
 */

import { inflateRawSync } from 'node:zlib'

export type Cella = string | number | null
/** Griglia 0-based: `griglia[riga][colonna]`. */
export type Griglia = Cella[][]

// ------------------------------------------------------------
// Lettura dello zip
// ------------------------------------------------------------

const FIRMA_EOCD = 0x06054b50
const FIRMA_CD = 0x02014b50
const FIRMA_LOCALE = 0x04034b50

/** Nome della parte → contenuto decompresso. Solo le parti richieste. */
function apriZip(buf: Buffer, volute: (nome: string) => boolean): Map<string, Buffer> {
  // L'indice sta in fondo, dopo un commento di lunghezza variabile: si cerca
  // la firma all'indietro, al massimo per 64 kB + 22 byte.
  let eocd = -1
  const minimo = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= minimo; i--) {
    if (buf.readUInt32LE(i) === FIRMA_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Il file non è un .xlsx (manca l’indice dello zip)')

  const quante = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  if (p === 0xffffffff) throw new Error('File zip64: non supportato')

  const parti = new Map<string, Buffer>()
  for (let n = 0; n < quante; n++) {
    if (buf.readUInt32LE(p) !== FIRMA_CD) break
    const metodo = buf.readUInt16LE(p + 10)
    const dimCompressa = buf.readUInt32LE(p + 20)
    const lunNome = buf.readUInt16LE(p + 28)
    const lunExtra = buf.readUInt16LE(p + 30)
    const lunCommento = buf.readUInt16LE(p + 32)
    const offsetLocale = buf.readUInt32LE(p + 42)
    const nome = buf.toString('utf8', p + 46, p + 46 + lunNome)
    p += 46 + lunNome + lunExtra + lunCommento

    if (!volute(nome)) continue
    if (buf.readUInt32LE(offsetLocale) !== FIRMA_LOCALE) continue
    // Le lunghezze dell'intestazione locale possono differire da quelle
    // dell'indice: qui contano queste, sono loro a dire dove iniziano i dati.
    const lunNomeL = buf.readUInt16LE(offsetLocale + 26)
    const lunExtraL = buf.readUInt16LE(offsetLocale + 28)
    const inizio = offsetLocale + 30 + lunNomeL + lunExtraL
    const dati = buf.subarray(inizio, inizio + dimCompressa)
    parti.set(nome, metodo === 0 ? Buffer.from(dati) : inflateRawSync(dati))
  }
  return parti
}

// ------------------------------------------------------------
// XML
// ------------------------------------------------------------

/**
 * Toglie il prefisso di namespace dai nomi dei tag (`<x:sst>` → `<sst>`).
 * Tocca solo la posizione del nome, subito dopo `<` o `</`: gli attributi
 * come `r:id` restano quelli che sono.
 */
const senzaPrefissi = (xml: string) => xml.replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1')

const ENTITA: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodifica(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (tutto, corpo: string) => {
    if (corpo[0] === '#') {
      const n = corpo[1] === 'x' ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10)
      return isFinite(n) ? String.fromCodePoint(n) : tutto
    }
    return ENTITA[corpo] ?? tutto
  })
}

/** Testo di tutti i `<t>` dentro un blocco (gestisce anche il testo ricco). */
function testiDi(blocco: string): string {
  let out = ''
  const re = /<t\b[^>]*?(\/>|>([\s\S]*?)<\/t>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(blocco))) out += m[1] === '/>' ? '' : decodifica(m[2] ?? '')
  return out
}

function stringheCondivise(xml: string | undefined): string[] {
  if (!xml) return []
  const out: string[] = []
  const re = /<si\b[^>]*?(\/>|>([\s\S]*?)<\/si>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(m[1] === '/>' ? '' : testiDi(m[2] ?? ''))
  return out
}

/** Da `B7` a 1 (indice 0-based della colonna). */
function colonnaDa(rif: string): number {
  let n = 0
  for (const ch of rif) {
    const c = ch.charCodeAt(0)
    if (c < 65 || c > 90) break
    n = n * 26 + (c - 64)
  }
  return n - 1
}

function leggiRighe(xml: string, condivise: string[]): Griglia {
  const griglia: Griglia = []
  const reRiga = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g
  let mr: RegExpExecArray | null
  while ((mr = reRiga.exec(xml))) {
    const attrRiga = mr[1]
    const corpo = mr[2] === '/>' ? '' : mr[3] ?? ''
    const riga: Cella[] = []

    const reCella = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g
    let mc: RegExpExecArray | null
    let colonna = 0
    while ((mc = reCella.exec(corpo))) {
      const attr = mc[1]
      const dentro = mc[2] === '/>' ? '' : mc[3] ?? ''

      // Il riferimento c'è nei file a norma e non c'è in quelli di Fattura
      // SMART: se manca si contano le celle, che è poi quello che intendeva
      // chi ha scritto il file.
      const rif = /\br="([A-Z]+\d+)"/.exec(attr)
      const idx = rif ? colonnaDa(rif[1]) : colonna
      colonna = idx + 1

      const tipo = /\bt="([^"]+)"/.exec(attr)?.[1] ?? 'n'
      let valore: Cella = null

      if (tipo === 'inlineStr') {
        valore = testiDi(dentro)
      } else {
        const v = /<v\b[^>]*?(\/>|>([\s\S]*?)<\/v>)/.exec(dentro)
        const grezzo = v ? (v[1] === '/>' ? '' : decodifica(v[2] ?? '')) : null
        if (grezzo == null || grezzo === '') valore = null
        else if (tipo === 's') {
          const i = Number(grezzo)
          valore = condivise[i] ?? ''
        } else if (tipo === 'str' || tipo === 'e') valore = grezzo
        else if (tipo === 'b') valore = grezzo === '1' ? 'VERO' : 'FALSO'
        else {
          const n = Number(grezzo)
          valore = isFinite(n) ? n : grezzo
        }
      }
      riga[idx] = valore
    }

    const rifRiga = /\br="(\d+)"/.exec(attrRiga)
    if (rifRiga) {
      // File a norma: la riga sa dove sta, e le righe vuote non ci sono.
      const n = Number(rifRiga[1]) - 1
      while (griglia.length < n) griglia.push([])
      griglia[n] = riga
    } else {
      griglia.push(riga)
    }
  }
  return griglia
}

// ------------------------------------------------------------
// Porta d'ingresso
// ------------------------------------------------------------

/**
 * Legge il primo foglio di un .xlsx e ne restituisce la griglia dei valori.
 * Le celle vuote sono `null`; le date restano numeri seriali di Excel.
 */
export function leggiFoglio(buffer: ArrayBuffer | Buffer): Griglia {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const parti = apriZip(
    buf,
    (n) => n === 'xl/sharedStrings.xml' || n.startsWith('xl/worksheets/sheet'),
  )

  const fogli = Array.from(parti.keys())
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
  if (fogli.length === 0) throw new Error('Il file non contiene nessun foglio di calcolo')

  const condivise = stringheCondivise(
    parti.has('xl/sharedStrings.xml')
      ? senzaPrefissi(parti.get('xl/sharedStrings.xml')!.toString('utf8'))
      : undefined,
  )
  return leggiRighe(senzaPrefissi(parti.get(fogli[0])!.toString('utf8')), condivise)
}
