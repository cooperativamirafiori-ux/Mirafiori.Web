/**
 * Controllo di coerenza del codice fiscale con nome, cognome e data di nascita.
 *
 * Funzioni pure, senza dipendenze: girano sia sul server sia nel browser.
 * Servono soprattutto dopo la lettura automatica dei documenti: se Claude legge
 * male una lettera, è qui che ce ne accorgiamo prima di salvare.
 *
 * Non controlla il comune di nascita (servirebbe la tabella dei codici
 * catastali, che l'app non ha): controlla cognome, nome, data e il carattere
 * di controllo finale, che da solo intercetta quasi tutti gli errori di lettura.
 * Gestisce l'omocodia (cifre sostituite da lettere).
 */

const MESI = 'ABCDEHLMPRST'
const OMOCODIA = 'LMNPQRSTUV'
/** Posizioni (0-based) che in caso di omocodia possono contenere lettere */
const POS_NUMERICHE = [6, 7, 9, 10, 12, 13, 14]

const DISPARI: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
}

function pari(c: string): number {
  return /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65
}

/** Solo lettere maiuscole, accenti tolti ("D'Angelo" → "DANGELO") */
function soloLettere(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

const consonanti = (s: string) => s.replace(/[AEIOU]/g, '')
const vocali = (s: string) => s.replace(/[^AEIOU]/g, '')

export function codiceCognome(cognome: string): string {
  const s = soloLettere(cognome)
  return (consonanti(s) + vocali(s) + 'XXX').slice(0, 3)
}

export function codiceNome(nome: string): string {
  const s = soloLettere(nome)
  const c = consonanti(s)
  if (c.length >= 4) return c[0] + c[2] + c[3]
  return (c + vocali(s) + 'XXX').slice(0, 3)
}

export function carattereControllo(primi15: string): string {
  let somma = 0
  for (let i = 0; i < 15; i++) {
    const ch = primi15[i]
    somma += i % 2 === 0 ? DISPARI[ch] ?? 0 : pari(ch)
  }
  return String.fromCharCode(65 + (somma % 26))
}

/** Riporta a cifre le posizioni numeriche (toglie l'omocodia). */
function deomocodia(cf: string): string {
  const a = cf.split('')
  for (const p of POS_NUMERICHE) {
    const i = OMOCODIA.indexOf(a[p])
    if (i >= 0) a[p] = String(i)
  }
  return a.join('')
}

export interface EsitoCodiceFiscale {
  /** Problemi trovati, in italiano semplice. Vuoto = tutto torna. */
  avvisi: string[]
  /** Sesso ricavato dal codice ('M' | 'F'), se leggibile */
  sesso?: 'M' | 'F'
}

export function controllaCodiceFiscale(
  cfGrezzo: string,
  dati: { nome?: string; cognome?: string; dataNascita?: string },
): EsitoCodiceFiscale {
  const cf = (cfGrezzo || '').toUpperCase().replace(/\s+/g, '')
  const avvisi: string[] = []

  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) {
    return { avvisi: ['Il codice fiscale non ha un formato valido.'] }
  }

  if (carattereControllo(cf.slice(0, 15)) !== cf[15]) {
    avvisi.push('Il codice fiscale non supera il controllo dell’ultima lettera: probabilmente un carattere è letto male.')
  }

  const d = deomocodia(cf)
  if (dati.cognome && codiceCognome(dati.cognome) !== d.slice(0, 3)) {
    avvisi.push('Il codice fiscale non corrisponde al cognome.')
  }
  if (dati.nome && codiceNome(dati.nome) !== d.slice(3, 6)) {
    avvisi.push('Il codice fiscale non corrisponde al nome.')
  }

  const giornoCodice = Number(d.slice(9, 11))
  const sesso: 'M' | 'F' = giornoCodice > 40 ? 'F' : 'M'

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dati.dataNascita || '')
  if (m) {
    const [, anno, mese, giorno] = m
    const ok =
      d.slice(6, 8) === anno.slice(2) &&
      d[8] === MESI[Number(mese) - 1] &&
      giornoCodice % 40 === Number(giorno)
    if (!ok) avvisi.push('Il codice fiscale non corrisponde alla data di nascita.')
  }

  return { avvisi, sesso }
}
