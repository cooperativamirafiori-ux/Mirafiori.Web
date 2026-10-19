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
  AMBITI,
  CARTELLE,
  ELENCO_MODELLI,
  REGIMI_IVA,
  UNITA,
  type Ambito,
  type DatiPreventivo,
  type Modello,
  type RegimeIva,
  type RigaPreventivo,
  type StatoPreventivo,
  type Tariffa,
  type Unita,
} from '@/types/preventivi'
import { arrotonda, isoValida, problemaPrezzo, tariffaPerCodice } from './calcoli'

const testo = (v: unknown, max = 255) => String(v ?? '').trim().slice(0, max)
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function leggiRiga(x: any): RigaPreventivo | null {
  if (!x || typeof x !== 'object') return null
  const unita = (Object.keys(UNITA) as Unita[]).includes(x.unita) ? (x.unita as Unita) : null
  const iva = (Object.keys(REGIMI_IVA) as RegimeIva[]).includes(x.iva) ? (x.iva as RegimeIva) : null
  const codice = testo(x.codice, 40)
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

/** Il corpo della richiesta → dati del preventivo, oppure l'elenco dei problemi. */
export function leggiDati(b: Record<string, any>): { dati: DatiPreventivo } | { problemi: string[] } {
  const problemi: string[] = []
  const modello = (ELENCO_MODELLI as string[]).includes(b.modello) ? (b.modello as Modello) : null
  if (!modello) problemi.push('Scegli il modello')
  const ccCodice = testo(b.ccCodice, 20).toLowerCase()
  if (!ccCodice) problemi.push('Scegli il servizio')
  const ambito = (AMBITI as readonly string[]).includes(b.ambito) ? (b.ambito as Ambito) : 'Tutti'
  const cartella = (CARTELLE as readonly string[]).includes(b.cartella) ? b.cartella : 'Altro'
  const d = b.destinatario ?? {}
  const destinatario = {
    ente: testo(d.ente, 200),
    nome: testo(d.nome, 200),
    ruolo: testo(d.ruolo, 80),
    email: testo(d.email, 200).toLowerCase(),
  }
  if (destinatario.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destinatario.email)) problemi.push('Email del destinatario non valida')
  const dal = isoValida(b.dal) ? b.dal : ''
  const al = isoValida(b.al) ? b.al : ''
  if (dal && al && al < dal) problemi.push('Il periodo finisce prima di cominciare')
  const righe = Array.isArray(b.righe) ? b.righe.map(leggiRiga) : []
  if (righe.some((r: RigaPreventivo | null) => r === null)) problemi.push('Una delle voci non è valida')
  if (righe.length > 60) problemi.push('Troppe voci')
  if (problemi.length) return { problemi }
  return {
    dati: {
      modello: modello!,
      ccCodice,
      cartella,
      ambito,
      destinatario,
      beneficiario: testo(b.beneficiario, 200),
      oggetto: testo(b.oggetto, 255),
      tipoProgetto: testo(b.tipoProgetto, 200),
      ripartizione: testo(b.ripartizione, 200),
      dal,
      al,
      righe: righe as RigaPreventivo[],
      note: testo(b.note, 4000),
    },
  }
}

/**
 * Cosa manca per poter emettere. Una bozza si salva anche incompleta; il
 * documento che parte verso l'ente no.
 */
export function mancantiPerEmettere(d: DatiPreventivo): string[] {
  const m: string[] = []
  if (!d.destinatario.ente) m.push('ente destinatario')
  if (!d.beneficiario) m.push('a favore di chi')
  if (!d.dal || !d.al) m.push('periodo')
  if (!d.righe.length) m.push('almeno una voce')
  if (d.righe.length && d.righe.every((r) => r.prezzo * (r.quantita || r.perSettimana || r.accompagnamenti || 0) === 0)) {
    m.push('le quantità')
  }
  return m
}

/**
 * Le righe rispettano il tariffario valido alla data? È qui che vive la regola
 * decisa in riunione: i servizi decidono le quantità, non i prezzi.
 * `libero` (Amministrazione) può uscire dai limiti, mai usare voci inesistenti.
 */
export function problemiTariffe(righe: RigaPreventivo[], tariffe: Tariffa[], data: string, ambito: string, libero: boolean): string[] {
  const out: string[] = []
  for (const r of righe) {
    const t = tariffaPerCodice(tariffe, r.codice, data, ambito)
    if (!t) {
      out.push(`«${r.voce || r.codice}» non è (più) nel tariffario`)
      continue
    }
    const p = problemaPrezzo(t, r.prezzo, libero)
    if (p) out.push(p)
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
