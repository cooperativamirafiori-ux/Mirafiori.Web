/**
 * Tariffario dei preventivi: lo amministra chi vede tutto (Andrea), i servizi
 * lo leggono e basta.
 *
 * Dal 20/11/2026 è la matrice di Andrea: una riga per Servizio + Sottotipo +
 * Voce + Ente pagante ("Tutti", "Tutti gli altri enti" o un ente preciso).
 * Il prezzo è fisso; se manca è "da definire" e lo scrive chi fa il preventivo.
 *
 * ⚠️ IL PASSATO NON CAMBIA. Un prezzo non si sovrascrive: si chiude la riga in
 * vigore il giorno prima della decorrenza e se ne apre una nuova con lo
 * stesso codice. Vale per il cambio di un singolo prezzo e per l'adeguamento
 * ISTAT, che lo fa in blocco. I preventivi già fatti hanno comunque i loro
 * prezzi fotografati nelle righe; lo storico serve a sapere quale prezzo
 * valeva quando.
 *
 * In place si correggono solo i campi descrittivi (nome della voce, servizio,
 * sottotipo, ente, sezione, note).
 */

import { ENTE_TUTTI, GRUPPI, REGIMI_IVA, UNITA, type RegimeIva, type Tariffa, type Unita } from '@/types/preventivi'
import { aggiungiGiorni, anteprimaIstat, arrotonda, isoValida, tariffaValidaIl, type VoceIstat } from './calcoli'
import { aggiornaTariffa, creaTariffa, getTariffe, type DatiTariffa } from './data'

const testo = (v: unknown, max = 255) => String(v ?? '').trim().slice(0, max)
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Codice stabile di una voce nuova, ricavato da servizio, voce ed ente. */
export function codiceVoce(servizio: string, sottotipo: string, voce: string, ente: string): string {
  return [servizio.slice(0, 18), sottotipo.slice(0, 14), voce.slice(0, 22), ente === ENTE_TUTTI ? '' : ente.slice(0, 14)]
    .filter(Boolean)
    .join('_')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 60)
}

export function leggiTariffa(b: Record<string, any>): { dati: DatiTariffa } | { problemi: string[] } {
  const problemi: string[] = []
  const servizio = testo(b.servizio, 200)
  const sottotipo = testo(b.sottotipo, 200)
  const voce = testo(b.voce, 200)
  const ente = testo(b.ente, 200) || ENTE_TUTTI
  const unita = (Object.keys(UNITA) as Unita[]).includes(b.unita) ? (b.unita as Unita) : null
  const iva = (Object.keys(REGIMI_IVA) as RegimeIva[]).includes(b.iva) ? (b.iva as RegimeIva) : null
  const prezzo = num(b.prezzo)
  const dal = isoValida(b.dal) ? b.dal : ''
  if (!servizio) problemi.push('Scrivi il servizio')
  if (!voce) problemi.push('Scrivi il nome della voce')
  if (!unita) problemi.push('Scegli l’unità')
  if (!iva) problemi.push('Scegli l’IVA')
  if (prezzo !== null && prezzo < 0) problemi.push('Prezzo non valido')
  if (!dal) problemi.push('Da quando vale?')
  if (problemi.length) return { problemi }
  return {
    dati: {
      codice: testo(b.codice, 60).toUpperCase().replace(/[^A-Z0-9_]/g, '_') || codiceVoce(servizio, sottotipo, voce, ente),
      servizio,
      sottotipo,
      voce,
      ente,
      gruppo: (GRUPPI as readonly string[]).includes(b.gruppo) ? b.gruppo : 'Altre prestazioni',
      unita: unita!,
      prezzo: prezzo === null ? null : arrotonda(prezzo),
      iva: iva!,
      dal,
      al: isoValida(b.al) ? b.al : null,
      ordine: num(b.ordine) ?? 5000,
      note: testo(b.note, 2000),
    },
  }
}

/** Due righe dello stesso codice non possono valere lo stesso giorno. */
function sovrapposta(tariffe: Tariffa[], codice: string, dal: string, escludi?: string): Tariffa | undefined {
  return tariffe.find((t) => t.spItemId !== escludi && t.codice === codice && (tariffaValidaIl(t, dal) || t.dal > dal))
}

export async function nuovaVoce(d: DatiTariffa): Promise<Tariffa> {
  const tariffe = await getTariffe()
  const doppia = tariffe.find(
    (t) =>
      !t.al &&
      t.servizio === d.servizio &&
      t.sottotipo === d.sottotipo &&
      t.voce.toLowerCase() === d.voce.toLowerCase() &&
      t.ente === d.ente,
  )
  if (doppia) throw new Error(`Questa voce c’è già per «${d.ente}»: per cambiarne il prezzo usa «Nuovo prezzo»`)
  let codice = d.codice
  for (let i = 2; sovrapposta(tariffe, codice, d.dal); i++) codice = `${d.codice}_${i}`
  return creaTariffa({ ...d, codice })
}

/** Cambio di prezzo da una data: chiude la riga in vigore e ne apre una nuova. `null` = da definire. */
export async function nuovoPrezzo(spItemId: string, v: { prezzo: number | null; dal: string; nota?: string }): Promise<Tariffa> {
  const tariffe = await getTariffe()
  const t = tariffe.find((x) => x.spItemId === spItemId)
  if (!t) throw new Error('Voce non trovata')
  if (!isoValida(v.dal)) throw new Error('Data di decorrenza non valida')
  if (v.dal <= t.dal) throw new Error(`La decorrenza deve essere dopo il ${t.dal.split('-').reverse().join('/')}, inizio della riga attuale`)
  if (t.al && t.al < v.dal) throw new Error('Questa riga è già chiusa: il prezzo nuovo va sulla riga in vigore')
  const dopo = tariffe.find((x) => x.codice === t.codice && x.dal > t.dal && x.spItemId !== t.spItemId)
  if (dopo) throw new Error('C’è già un prezzo successivo per questa voce')
  await aggiornaTariffa(spItemId, { al: aggiungiGiorni(v.dal, -1) })
  return creaTariffa({
    codice: t.codice,
    servizio: t.servizio,
    sottotipo: t.sottotipo,
    voce: t.voce,
    ente: t.ente,
    gruppo: t.gruppo,
    unita: t.unita,
    prezzo: v.prezzo === null ? null : arrotonda(v.prezzo),
    iva: t.iva,
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
 * scelte, con prezzo × (1 + percentuale). Restano fuori rimborso km, spese
 * F.I.C. e voci senza prezzo. Ritorna quante voci ha aggiornato e quelle
 * saltate con il motivo.
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
        dal,
        nota: `Adeguamento ISTAT +${String(percentuale).replace('.', ',')}% dal ${dal.split('-').reverse().join('/')} (era ${v.prima.toFixed(2).replace('.', ',')} €)`,
      })
      aggiornate++
    } catch (e) {
      saltate.push({ voce: `${v.servizio} · ${v.voce}`, motivo: e instanceof Error ? e.message : 'errore' })
    }
  }
  return { aggiornate, saltate }
}
