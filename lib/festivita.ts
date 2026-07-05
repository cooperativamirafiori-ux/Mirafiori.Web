/**
 * Calcolo festività italiane (nazionali) + locali Torino, per un dato anno.
 * Replica la logica del foglio "Pasqua" (algoritmo di Gauss) e della tabella
 * festività del foglio "Dati". Usato per azzerare il monte ore atteso nei giorni
 * festivi e per etichettare i giorni nel cruscotto.
 */

/** Domenica di Pasqua (algoritmo di Gauss) per l'anno dato. */
export function pasqua(anno: number): Date {
  const a = anno % 19
  const b = Math.floor(anno / 100)
  const c = anno % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mese = Math.floor((h + l - 7 * m + 114) / 31) // 3=marzo, 4=aprile
  const giorno = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(anno, mese - 1, giorno))
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Mappa YYYY-MM-DD → nome festività per l'anno indicato.
 * Include San Giovanni (24/6), patrono di Torino.
 */
export function festivitaAnno(anno: number): Record<string, string> {
  const map: Record<string, string> = {}
  const fisse: Array<[number, number, string]> = [
    [1, 1, 'Capodanno'],
    [1, 6, 'Epifania'],
    [4, 25, 'Festa della Liberazione'],
    [5, 1, 'Festa dei Lavoratori'],
    [6, 2, 'Festa della Repubblica'],
    [6, 24, 'San Giovanni'], // patrono di Torino
    [8, 15, 'Ferragosto'],
    [11, 1, 'Ognissanti'],
    [12, 8, 'Immacolata Concezione'],
    [12, 25, 'Natale'],
    [12, 26, 'Santo Stefano'],
  ]
  for (const [m, g, nome] of fisse) {
    map[ymd(new Date(Date.UTC(anno, m - 1, g)))] = nome
  }
  const p = pasqua(anno)
  map[ymd(p)] = 'Pasqua'
  const pasquetta = new Date(p)
  pasquetta.setUTCDate(p.getUTCDate() + 1)
  map[ymd(pasquetta)] = 'Pasquetta'
  return map
}

export function isFestivo(dataYmd: string): string | null {
  const anno = Number(dataYmd.slice(0, 4))
  return festivitaAnno(anno)[dataYmd] ?? null
}
