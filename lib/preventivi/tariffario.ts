/**
 * Tariffario dei preventivi: lo amministra chi vede tutto (Andrea), i servizi
 * lo leggono e basta.
 *
 * ⚠️ IL PASSATO NON CAMBIA. Un prezzo non si sovrascrive: si chiude la riga in
 * vigore il giorno prima della decorrenza e se ne apre una nuova con lo
 * stesso codice. Vale per il cambio di un singolo prezzo e per l'adeguamento
 * ISTAT, che lo fa in blocco. I preventivi già fatti hanno comunque i loro
 * prezzi fotografati nelle righe; lo storico serve a sapere quale prezzo
 * valeva quando.
 *
 * In place si correggono solo i campi descrittivi (nome della voce, sezione,
 * note, modelli in cui compare).
 */

import {
  AMBITI,
  ELENCO_MODELLI,
  REGIMI_IVA,
  UNITA,
  type Ambito,
  type Modello,
  type RegimeIva,
  type Tariffa,
  type Unita,
} from '@/types/preventivi'
import { aggiungiGiorni, anteprimaIstat, arrotonda, isoValida, tariffaValidaIl, type VoceIstat } from './calcoli'
import { aggiornaTariffa, creaTariffa, getTariffe, type DatiTariffa } from './data'

const testo = (v: unknown, max = 255) => String(v ?? '').trim().slice(0, max)
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function leggiTariffa(b: Record<string, any>): { dati: DatiTariffa } | { problemi: string[] } {
  const problemi: string[] = []
  const voce = testo(b.voce, 200)
  const codice = testo(b.codice, 40).toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  const unita = (Object.keys(UNITA) as Unita[]).includes(b.unita) ? (b.unita as Unita) : null
  const iva = (Object.keys(REGIMI_IVA) as RegimeIva[]).includes(b.iva) ? (b.iva as RegimeIva) : null
  const ambito = (AMBITI as readonly string[]).includes(b.ambito) ? (b.ambito as Ambito) : 'Tutti'
  const modelli = (Array.isArray(b.modelli) ? b.modelli : []).filter((m: string): m is Modello =>
    (ELENCO_MODELLI as string[]).includes(m),
  )
  const prezzo = num(b.prezzo)
  const min = num(b.min)
  const max = num(b.max)
  const dal = isoValida(b.dal) ? b.dal : ''
  if (!voce) problemi.push('Scrivi il nome della voce')
  if (!codice) problemi.push('Scrivi un codice')
  if (!unita) problemi.push('Scegli l’unità')
  if (!iva) problemi.push('Scegli il regime IVA')
  if (prezzo === null || prezzo < 0) problemi.push('Prezzo non valido')
  if (min !== null && max !== null && min > max) problemi.push('Il minimo supera il massimo')
  if (prezzo !== null && min !== null && prezzo < min) problemi.push('Il prezzo è sotto il minimo')
  if (prezzo !== null && max !== null && prezzo > max) problemi.push('Il prezzo è sopra il massimo')
  if (!dal) problemi.push('Da quando vale?')
  if (problemi.length) return { problemi }
  return {
    dati: {
      codice,
      voce,
      gruppo: testo(b.gruppo, 80) || 'Altre prestazioni',
      unita: unita!,
      prezzo: arrotonda(prezzo!),
      bloccato: b.bloccato === true,
      min: min === null ? null : arrotonda(min),
      max: max === null ? null : arrotonda(max),
      iva: iva!,
      modelli,
      ambito,
      dal,
      al: isoValida(b.al) ? b.al : null,
      ordine: num(b.ordine) ?? 500,
      note: testo(b.note, 2000),
    },
  }
}

/** Due righe dello stesso codice e ambito non possono valere lo stesso giorno. */
function sovrapposta(tariffe: Tariffa[], codice: string, ambito: string, dal: string, escludi?: string): Tariffa | undefined {
  return tariffe.find(
    (t) => t.spItemId !== escludi && t.codice === codice && t.ambito === ambito && (tariffaValidaIl(t, dal) || t.dal > dal),
  )
}

export async function nuovaVoce(d: DatiTariffa): Promise<Tariffa> {
  const tariffe = await getTariffe()
  const c = sovrapposta(tariffe, d.codice, d.ambito, d.dal)
  if (c) throw new Error(`Il codice ${d.codice} esiste già (${c.voce}): per cambiarne il prezzo usa «Nuovo prezzo»`)
  return creaTariffa(d)
}

/** Cambio di prezzo da una data: chiude la riga in vigore e ne apre una nuova. */
export async function nuovoPrezzo(
  spItemId: string,
  v: { prezzo: number; min: number | null; max: number | null; dal: string; nota?: string },
): Promise<Tariffa> {
  const tariffe = await getTariffe()
  const t = tariffe.find((x) => x.spItemId === spItemId)
  if (!t) throw new Error('Voce non trovata')
  if (!isoValida(v.dal)) throw new Error('Data di decorrenza non valida')
  if (v.dal <= t.dal) throw new Error(`La decorrenza deve essere dopo il ${t.dal.split('-').reverse().join('/')}, inizio della riga attuale`)
  if (t.al && t.al < v.dal) throw new Error('Questa riga è già chiusa: il prezzo nuovo va sulla riga in vigore')
  const dopo = tariffe.find((x) => x.codice === t.codice && x.ambito === t.ambito && x.dal > t.dal && x.spItemId !== t.spItemId)
  if (dopo) throw new Error('C’è già un prezzo successivo per questa voce')
  await aggiornaTariffa(spItemId, { al: aggiungiGiorni(v.dal, -1) })
  return creaTariffa({
    codice: t.codice,
    voce: t.voce,
    gruppo: t.gruppo,
    unita: t.unita,
    prezzo: arrotonda(v.prezzo),
    bloccato: t.bloccato,
    min: v.min,
    max: v.max,
    iva: t.iva,
    modelli: t.modelli,
    ambito: t.ambito,
    dal: v.dal,
    al: null,
    ordine: t.ordine,
    note: v.nota ?? t.note,
  })
}

export async function chiudiVoce(spItemId: string, al: string): Promise<void> {
  if (!isoValida(al)) throw new Error('Data non valida')
  await aggiornaTariffa(spItemId, { al })
}

export async function istatAnteprima(percentuale: number, dal: string, ids?: string[]): Promise<VoceIstat[]> {
  return anteprimaIstat(await getTariffe(), percentuale, dal, ids)
}

/**
 * Adeguamento ISTAT: stessa operazione di `nuovoPrezzo` su tutte le voci
 * scelte, con prezzo e limiti × (1 + percentuale). Il rimborso chilometrico
 * resta fuori (non è una tariffa rivalutabile).
 * Ritorna quante voci ha aggiornato e quelle saltate con il motivo.
 */
export async function istatApplica(
  percentuale: number,
  dal: string,
  ids: string[],
): Promise<{ aggiornate: number; saltate: { voce: string; motivo: string }[] }> {
  if (!(percentuale > 0 && percentuale < 50)) throw new Error('Percentuale non valida')
  if (!isoValida(dal)) throw new Error('Data di decorrenza non valida')
  const voci = await istatAnteprima(percentuale, dal, ids)
  const saltate: { voce: string; motivo: string }[] = []
  let aggiornate = 0
  for (const v of voci) {
    try {
      await nuovoPrezzo(v.spItemId, {
        prezzo: v.dopo,
        min: v.minDopo,
        max: v.maxDopo,
        dal,
        nota: `Adeguamento ISTAT +${String(percentuale).replace('.', ',')}% dal ${dal.split('-').reverse().join('/')} (era ${v.prima.toFixed(2).replace('.', ',')} €)`,
      })
      aggiornate++
    } catch (e) {
      saltate.push({ voce: v.voce, motivo: e instanceof Error ? e.message : 'errore' })
    }
  }
  return { aggiornate, saltate }
}
