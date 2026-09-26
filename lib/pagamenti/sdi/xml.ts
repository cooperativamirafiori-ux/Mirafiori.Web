/**
 * Lettore XML minimo, quanto basta per la FatturaPA.
 *
 * Perché non una libreria: il formato è fisso, ben formato (lo SDI scarta chi
 * non lo è) e senza strutture esotiche. Servono elementi, testo e poco altro;
 * i prefissi di namespace (`p:`, `n0:`, `ns2:` — ogni software mette il suo)
 * si buttano, perché dentro la fattura i nomi sono univoci senza.
 */

export interface Elemento {
  nome: string // senza prefisso
  figli: Elemento[]
  testo: string
}

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodifica(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITA[e.toLowerCase()] ?? m
  })
}

const senzaPrefisso = (n: string) => n.slice(n.indexOf(':') + 1)

export function leggiXml(testo: string): Elemento {
  const radice: Elemento = { nome: '#documento', figli: [], testo: '' }
  const pila: Elemento[] = [radice]
  let i = 0
  const n = testo.length
  while (i < n) {
    const lt = testo.indexOf('<', i)
    if (lt < 0) break
    if (lt > i) pila[pila.length - 1].testo += decodifica(testo.slice(i, lt))
    if (testo.startsWith('<!--', lt)) {
      i = testo.indexOf('-->', lt) + 3
    } else if (testo.startsWith('<![CDATA[', lt)) {
      const f = testo.indexOf(']]>', lt)
      pila[pila.length - 1].testo += testo.slice(lt + 9, f)
      i = f + 3
    } else if (testo[lt + 1] === '?' || testo[lt + 1] === '!') {
      i = testo.indexOf('>', lt) + 1
    } else if (testo[lt + 1] === '/') {
      i = testo.indexOf('>', lt) + 1
      if (pila.length > 1) pila.pop()
    } else {
      const gt = testo.indexOf('>', lt)
      const dentro = testo.slice(lt + 1, gt)
      const chiuso = dentro.endsWith('/')
      const nome = senzaPrefisso(dentro.replace(/\/$/, '').trim().split(/\s+/)[0])
      // Tag HTML finiti dentro un testo senza escape (`<br>` in una
      // descrizione): non sono elementi della fattura. Diventano uno spazio,
      // invece di aprire un elemento che non si chiude più e spostare tutto.
      if (/^(br|p|b|i|u|span|div)$/i.test(nome)) {
        pila[pila.length - 1].testo += ' '
        i = gt + 1
        continue
      }
      const el: Elemento = { nome, figli: [], testo: '' }
      pila[pila.length - 1].figli.push(el)
      if (!chiuso) pila.push(el)
      i = gt + 1
    }
    if (i <= 0) break // tag non chiuso: file troncato, si esce con quel che c'è
  }
  return radice
}

/** Primo discendente sul percorso `A/B/C` (ogni passo è un figlio diretto). */
export function trova(el: Elemento | undefined, percorso: string): Elemento | undefined {
  let cur = el
  for (const passo of percorso.split('/')) {
    cur = cur?.figli.find((f) => f.nome === passo)
    if (!cur) return undefined
  }
  return cur
}

/** Tutti i figli diretti con quel nome. */
export function tutti(el: Elemento | undefined, nome: string): Elemento[] {
  return el?.figli.filter((f) => f.nome === nome) ?? []
}

/** Primo elemento con quel nome a qualunque profondità. */
export function cerca(el: Elemento | undefined, nome: string): Elemento | undefined {
  if (!el) return undefined
  for (const f of el.figli) {
    if (f.nome === nome) return f
    const r = cerca(f, nome)
    if (r) return r
  }
  return undefined
}

export function testo(el: Elemento | undefined, percorso?: string): string | null {
  const e = percorso ? trova(el, percorso) : el
  const t = e?.testo.trim()
  return t ? t : null
}

export function numero(el: Elemento | undefined, percorso?: string): number | null {
  const t = testo(el, percorso)
  if (t == null) return null
  const v = Number(t.replace(',', '.'))
  return Number.isFinite(v) ? v : null
}
