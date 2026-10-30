/**
 * Legge la guida d'uso (cartella `guida/`) per l'assistente.
 *
 * La guida è la SOLA fonte dell'assistente: quello che non c'è scritto lì, lui
 * non lo sa. Le schede in testa ai file danno l'elenco delle pagine con chi può
 * aprirle — da lì nascono i link, mai dal testo libero.
 *
 * I file entrano nel pacchetto della route grazie a `outputFileTracingIncludes`
 * in next.config.mjs: aggiungendo una route che usa questo modulo, aggiungerla anche là.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface PaginaGuida {
  percorso: string
  titolo: string
  accesso: string[]
  cosa: string
  area: string
}

export interface Guida {
  /** Testo completo di tutte le guide, uno dopo l'altro, senza le schede. */
  testo: string
  pagine: PaginaGuida[]
}

let cache: Guida | null = null

function leggiScheda(testo: string): { area: string; pagine: PaginaGuida[]; corpo: string } {
  const m = testo.match(/^---\n([\s\S]*?)\n---\n/)
  if (!m) return { area: '', pagine: [], corpo: testo }
  let area = ''
  const pagine: PaginaGuida[] = []
  let corrente: PaginaGuida | null = null
  for (const r of m[1].split('\n')) {
    let x: RegExpMatchArray | null
    if ((x = r.match(/^area:\s*(.+)$/))) area = x[1].trim()
    else if ((x = r.match(/^\s*-\s*percorso:\s*(.+)$/))) {
      corrente = { percorso: x[1].trim(), titolo: '', accesso: [], cosa: '', area: '' }
      pagine.push(corrente)
    } else if (corrente && (x = r.match(/^\s+titolo:\s*(.+)$/))) corrente.titolo = x[1].trim()
    else if (corrente && (x = r.match(/^\s+cosa:\s*(.+)$/))) corrente.cosa = x[1].trim()
    else if (corrente && (x = r.match(/^\s+accesso:\s*\[(.*)\]\s*$/)))
      corrente.accesso = x[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  }
  for (const p of pagine) p.area = area
  return { area, pagine, corpo: testo.slice(m[0].length) }
}

export function leggiGuida(): Guida {
  if (cache) return cache
  const cartella = path.join(process.cwd(), 'guida')
  // generale.md per prima: sono le regole comuni, le altre ci si appoggiano.
  const file = fs
    .readdirSync(cartella)
    .filter((f) => f.endsWith('.md') && f !== 'LEGGIMI.md')
    .sort((a, b) => (a === 'generale.md' ? -1 : b === 'generale.md' ? 1 : a.localeCompare(b)))

  const parti: string[] = []
  const pagine: PaginaGuida[] = []
  for (const f of file) {
    const { area, pagine: p, corpo } = leggiScheda(fs.readFileSync(path.join(cartella, f), 'utf8'))
    pagine.push(...p)
    parti.push(`<guida area="${area || f}">\n${corpo.trim()}\n</guida>`)
  }
  cache = { testo: parti.join('\n\n'), pagine }
  return cache
}

/** Un indirizzo vero (/preventivi/12) corrisponde a una pagina con parti variabili (/preventivi/[id])? */
export function corrisponde(indirizzo: string, modello: string): boolean {
  const a = indirizzo.split('/')
  const b = modello.split('/')
  if (a.length !== b.length) return false
  return b.every((s, i) => /^\[.+\]$/.test(s) || s === a[i])
}

export function eVariabile(percorso: string): boolean {
  return /\[.+\]/.test(percorso)
}

/** La pagina della guida che corrisponde a un indirizzo; le pagine fisse vincono su quelle variabili. */
export function paginaDi(indirizzo: string, pagine: PaginaGuida[]): PaginaGuida | undefined {
  const pulito = indirizzo.split(/[?#]/)[0].replace(/\/$/, '') || '/'
  return pagine.find((p) => p.percorso === pulito) ?? pagine.find((p) => corrisponde(pulito, p.percorso))
}
