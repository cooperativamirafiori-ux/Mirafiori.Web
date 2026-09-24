/**
 * La bozza della richiesta, salvata nel browser mentre si compila.
 *
 * Se squilla il telefono a metà, o la pagina si ricarica, la richiesta non va
 * rifatta da capo: riaprendo il modulo compare «Continua da dove eri rimasto».
 *
 * Sta nel `localStorage` del telefono, una per persona (la chiave contiene la
 * mail di chi compila: sul telefono di servizio della Locanda ognuno ritrova
 * la sua). È una comodità, non un archivio: dura tre giorni, poi si butta, e
 * ogni lettura è dentro un `try` perché in navigazione privata il browser può
 * rifiutarla. Si cancella appena la richiesta parte.
 */

import type { NuovaRichiestaFatturaInput } from '@/types/fatture'
import type { Passo } from './passi'

export interface Bozza {
  form: NuovaRichiestaFatturaInput
  passo: Passo
  scelto: { nome: string } | null
  pagatoRisposto: boolean
  chiediServizio: boolean
  salvata: number
}

const DURATA = 3 * 24 * 60 * 60 * 1000
const chiave = (email: string) => `richiesta-fattura:bozza:${email.toLowerCase()}`

export function leggiBozza(email: string): Bozza | null {
  try {
    const raw = window.localStorage.getItem(chiave(email))
    if (!raw) return null
    const b = JSON.parse(raw) as Bozza
    if (!b?.form || Date.now() - (b.salvata ?? 0) > DURATA) {
      window.localStorage.removeItem(chiave(email))
      return null
    }
    return b
  } catch {
    return null
  }
}

export function salvaBozza(email: string, b: Omit<Bozza, 'salvata'>): void {
  try {
    window.localStorage.setItem(chiave(email), JSON.stringify({ ...b, salvata: Date.now() }))
  } catch {
    /* navigazione privata o spazio pieno: pazienza, è solo una comodità */
  }
}

export function cancellaBozza(email: string): void {
  try {
    window.localStorage.removeItem(chiave(email))
  } catch {
    /* idem */
  }
}
