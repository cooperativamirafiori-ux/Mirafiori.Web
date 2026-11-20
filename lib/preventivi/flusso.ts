/**
 * Preventivi — regole: cosa si legge dal modulo, cosa è ammesso, quali passaggi
 * di stato esistono. Funzioni pure, nessun accesso a SharePoint.
 *
 *   bozza ──emetti──► emesso ──accetta──► accettato   (finale: si rinnova)
 *     ▲                 │  └──rifiuta──► rifiutato
 *     └────riapri───────┘
 *   bozza ──annulla──► annullato
 *
 * Il numero di protocollo nasce all'emissione, non alla bozza: le bozze
 * abbandonate non lasciano buchi nel protocollo. Riaprire un preventivo emesso
 * per correggerlo (l'ente riconosce 5 ore invece di 10) tiene lo stesso numero
 * e alla nuova emissione sale la revisione.
 */

import {
  CARTELLE,
  COPPIE_TORINO,
  REGIMI_IVA,
  SUFFISSO_INDIRETTO,
  UNITA,
  ePrivato,
  type DatiPreventivo,
  type Persona,
  type RegimeIva,
  type RigaPreventivo,
  type StatoPreventivo,
  type Tariffa,
  type Unita,
} from '@/types/preventivi'
import { arrotonda, isoValida, problemaPrezzo, tariffaPerCodice, vociPerPreventivo } from './calcoli'

const testo = (v: unknown, max = 255) => String(v ?? '').trim().slice(0, max)
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function leggiRiga(x: any): RigaPreventivo | null {
  if (!x || typeof x !== 'object') return null
  const unita = (Object.keys(UNITA) as Unita[]).includes(x.unita) ? (x.unita as Unita) : null
  const iva = (Object.keys(REGIMI_IVA) as RegimeIva[]).includes(x.iva) ? (x.iva as RegimeIva) : null
  const codice = testo(x.codice, 80)
  if (!unita || !iva || !codice) return null
  const r: RigaPreventivo = {
    codice,
    voce: testo(x.voce, 200),
    gruppo: testo(x.gruppo, 80),
    unita,
    prezzo: arrotonda(num(x.prezzo) ?? 0),
    iva,
    quantita: Math.max(0, num(x.quantita) ?? 0),
    perSettimana: (unita === 'ora' || unita === 'giorno') && num(x.perSettimana) !== null ? Math.max(0, num(x.perSettimana)!) : null,
  }
  if (unita === 'km') {
    r.percorso = testo(x.percorso, 200)
    r.accompagnamenti = Math.max(0, num(x.accompagnamenti) ?? 0)
    r.kmAccompagnamento = Math.max(0, num(x.kmAccompagnamento) ?? 0)
  }
  const nota = testo(x.nota, 300)
  if (nota) r.nota = nota
  return r
}

function leggiPersona(x: any): Persona | null {
  if (!x || typeof x !== 'object') return null
  const p = { nome: testo(x.nome, 200), ruolo: testo(x.ruolo, 80), ente: testo(x.ente, 200), email: testo(x.email, 200).toLowerCase() }
  return p.nome || p.email ? p : null
}

/** Il corpo della richiesta → dati del preventivo, oppure l'elenco dei problemi. */
export function leggiDati(b: Record<string, any>): { dati: DatiPreventivo } | { problemi: string[] } {
  const problemi: string[] = []
  const ccCodice = testo(b.ccCodice, 20).toLowerCase()
  if (!ccCodice) problemi.push('Scegli il centro di costo')
  const servizio = testo(b.servizio, 200)
  if (!servizio) problemi.push('Scegli il servizio')
  const cartella = (CARTELLE as readonly string[]).includes(b.cartella) ? b.cartella : 'Altro'
  const privato = ePrivato(servizio)
  const ente = privato ? '' : testo(b.ente, 200)
  const persone = (Array.isArray(b.persone) ? b.persone : []).map(leggiPersona).filter((x: Persona | null): x is Persona => x !== null)
  if (persone.length > 10) problemi.push('Troppe persone')
  if (persone.some((x: Persona) => x.email && !EMAIL.test(x.email))) problemi.push('Una delle email non è valida')
  const referente2 = privato ? leggiPersona(b.referente2) : null
  if (referente2?.email && !EMAIL.test(referente2.email)) problemi.push('Email del secondo referente non valida')
  const dal = isoValida(b.dal) ? b.dal : ''
  const durataMesi = num(b.durataMesi)
  if (durataMesi === null || !(durataMesi > 0) || durataMesi > 60) problemi.push('Scrivi quanti mesi dura (da 1 a 60)')
  const righe = Array.isArray(b.righe) ? b.righe.map(leggiRiga) : []
  if (righe.some((r: RigaPreventivo | null) => r === null)) problemi.push('Una delle voci non è valida')
  if (righe.length > 60) problemi.push('Troppe voci')
  if (problemi.length) return { problemi }
  return {
    dati: {
      ccCodice,
      cartella,
      servizio,
      sottotipo: testo(b.sottotipo, 200),
      ente,
      persone,
      beneficiario: testo(b.beneficiario, 200),
      oggetto: testo(b.oggetto, 255),
      tipoProgetto: testo(b.tipoProgetto, 200),
      ripartizione: privato ? '' : testo(b.ripartizione, 200),
      dal,
      durataMesi: Math.round(durataMesi! * 2) / 2,
      righe: righe as RigaPreventivo[],
      note: testo(b.note, 4000),
      maggiorazione: privato && b.maggiorazione === true,
      referente2,
    },
  }
}

/**
 * Cosa manca per poter emettere. Una bozza si salva anche incompleta; il
 * documento che parte verso l'ente no. La data di inizio può restare "da
 * definire": basta la durata.
 */
export function mancantiPerEmettere(d: DatiPreventivo): string[] {
  const m: string[] = []
  const privato = ePrivato(d.servizio)
  if (!d.servizio) m.push('il servizio')
  if (!privato && !d.ente) m.push('l’ente')
  if (privato && !d.persone.length) m.push('a chi va (la famiglia)')
  if (!d.beneficiario) m.push('a favore di chi')
  if (!(d.durataMesi > 0)) m.push('la durata')
  if (!d.righe.length) m.push('almeno una voce')
  if (d.righe.length && d.righe.every((r) => r.prezzo * (r.quantita || r.perSettimana || r.accompagnamenti || 0) === 0)) {
    m.push('le quantità')
  }
  const senzaPrezzo = d.righe.filter((r) => r.iva !== 'fic' && !(r.prezzo > 0))
  if (senzaPrezzo.length) m.push(`il prezzo di ${senzaPrezzo.map((r) => `«${r.voce}»`).join(', ')}`)
  return m
}

/**
 * Le righe rispettano il tariffario valido alla data? Ogni voce deve valere
 * per quel servizio e quell'ente; il prezzo è quello del tariffario, salvo le
 * voci "da definire" (lo scrive chi fa il preventivo) e chi ha il permesso
 * Preventivi o Amministrazione (`libero`). Nessuno usa voci inesistenti.
 */
export function problemiTariffe(
  d: Pick<DatiPreventivo, 'righe' | 'servizio' | 'sottotipo' | 'ente'>,
  nomiEnti: string[],
  tariffe: Tariffa[],
  data: string,
  libero: boolean,
): string[] {
  const out: string[] = []
  const ammesse = new Set(
    vociPerPreventivo(tariffe, data, d.servizio, d.sottotipo, nomiEnti, d.ente in COPPIE_TORINO).map((t) => t.codice),
  )
  for (const r of d.righe) {
    const t = tariffaPerCodice(tariffe, r.codice, data)
    if (!t) {
      out.push(`«${r.voce || r.codice}» non è (più) nel tariffario`)
      continue
    }
    if (!ammesse.has(t.codice)) {
      out.push(`«${r.voce}» non vale per questo servizio e questo ente: toglila`)
      continue
    }
    if (r.codice.endsWith(SUFFISSO_INDIRETTO)) {
      const base = d.righe.find((x) => x.codice === t.codice)
      if (!base) out.push('Il lavoro indiretto va insieme al costo orario')
      else if (arrotonda(base.prezzo) !== arrotonda(r.prezzo)) out.push('Il lavoro indiretto ha lo stesso prezzo del costo orario')
    } else {
      const p = problemaPrezzo(t, r.prezzo, libero)
      if (p) out.push(p)
    }
    if (t.iva !== r.iva) out.push(`«${t.voce}»: il regime IVA è ${REGIMI_IVA[t.iva].etichetta}`)
  }
  return out
}

export const modificabile = (s: StatoPreventivo) => s === 'bozza'

export type Azione = 'emetti' | 'riapri' | 'accetta' | 'rifiuta' | 'annulla' | 'rinnova' | 'duplica'

const PASSAGGI: Record<StatoPreventivo, Azione[]> = {
  bozza: ['emetti', 'annulla', 'duplica'],
  emesso: ['accetta', 'rifiuta', 'riapri', 'rinnova', 'duplica'],
  accettato: ['rinnova', 'duplica'],
  rifiutato: ['duplica'],
  annullato: ['duplica'],
}

export const azioniDa = (s: StatoPreventivo): Azione[] => PASSAGGI[s]

export const ETICHETTE_AZIONI: Record<Azione, string> = {
  emetti: 'Emetti e scarica il PDF',
  riapri: 'Riapri per correggere',
  accetta: 'È stato accettato',
  rifiuta: 'È stato rifiutato',
  annulla: 'Annulla la bozza',
  rinnova: 'Rinnova',
  duplica: 'Duplica',
}

/** Giorni dopo cui un preventivo inviato senza esito si ricorda a chi l'ha fatto. */
export const GIORNI_SOLLECITO = 3
