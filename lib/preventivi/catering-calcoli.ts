/**
 * Preventivi Catering — i conti. Funzioni pure: le usa il calcolatore nel
 * browser e, se un giorno servirà, il server.
 *
 * Ricostruisce il foglio "Budget Preventivo.xlsx" della Locanda (22/10/2026):
 *
 *   cibo        = costo cibo a persona  × ospiti
 *   bere        = costo bere a persona  × ospiti
 *   trasporto   = km SOLO ANDATA × 2    × €/km            (foglio: 1,10 €/km)
 *   personale   = persone in servizio   × ore × €/ora      (foglio: 18,50 €/h)
 *   coperto     = ospiti                × €/coperto        (foglio: 1 €)
 *   totale      = somma delle cinque voci (COSTO di produzione)
 *   ricarico    = totale × ricarico %                      (aggiunto il 22/10/2026: 30%)
 *   imponibile  = totale + ricarico                        (prezzo di vendita IVA esclusa)
 *   con IVA     = imponibile × (1 + IVA)                   (foglio: 10%)
 *   a persona   = totale con IVA / ospiti
 *
 * I numeri fissi del foglio, più il ricarico, sono i "parametri": stanno sulla lista
 * SharePoint Parametri e li cambia chi ha Amministrazione (lib/preventivi/catering.ts).
 */

export interface ParametriCatering {
  /** € per km percorso (andata e ritorno si contano entrambi). */
  costoKm: number
  /** € per ora di una persona in servizio. */
  costoOraPersonale: number
  /** € per coperto (a ospite). */
  costoCoperto: number
  /** Ricarico sul costo in percento: 30 = +30%. */
  ricaricoPercento: number
  /** Aliquota IVA in percento: 10 = 10%. */
  ivaPercento: number
}

/** I valori del foglio Excel: si usano finché la lista Parametri non ha le righe. */
export const PARAMETRI_CATERING_PREDEFINITI: ParametriCatering = {
  costoKm: 1.1,
  costoOraPersonale: 18.5,
  costoCoperto: 1,
  ricaricoPercento: 30,
  ivaPercento: 10,
}

export const ETICHETTE_PARAMETRI: Record<keyof ParametriCatering, { titolo: string; unita: string; aiuto: string }> = {
  costoKm: { titolo: 'Costo trasporto', unita: '€ al km', aiuto: 'Si moltiplica per i km di andata e ritorno.' },
  costoOraPersonale: { titolo: 'Costo del personale', unita: '€ all’ora a persona', aiuto: 'Per ogni persona in servizio, per ogni ora.' },
  costoCoperto: { titolo: 'Costo del coperto', unita: '€ a ospite', aiuto: 'Stoviglie, tovagliato, materiale: a ogni ospite.' },
  ricaricoPercento: { titolo: 'Ricarico', unita: '%', aiuto: 'Si aggiunge al costo totale: è il margine della cooperativa.' },
  ivaPercento: { titolo: 'IVA', unita: '%', aiuto: 'Si aggiunge al prezzo con il ricarico.' },
}

export interface DatiCatering {
  /** Ospiti dell'evento. */
  ospiti: number
  /** € di solo cibo a persona. */
  ciboPersona: number
  /** € di bere a persona. */
  berePersona: number
  /** km dalla Locanda al luogo dell'evento, SOLO ANDATA. */
  kmAndata: number
  /** Persone di servizio. */
  personale: number
  /** Ore di impegno, dalla partenza dalla Locanda al rientro. */
  ore: number
}

export interface RisultatoCatering {
  cibo: number
  bere: number
  trasporto: number
  personale: number
  coperto: number
  /** Somma delle cinque voci: il costo di produzione. */
  totale: number
  ricarico: number
  /** Prezzo di vendita IVA esclusa: costo + ricarico. */
  imponibile: number
  iva: number
  totaleConIva: number
  /** null se gli ospiti sono zero: non si divide. */
  aPersona: number | null
}

const n = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0)

export function calcolaCatering(d: DatiCatering, p: ParametriCatering): RisultatoCatering {
  const ospiti = n(d.ospiti)
  const cibo = n(d.ciboPersona) * ospiti
  const bere = n(d.berePersona) * ospiti
  const trasporto = n(d.kmAndata) * 2 * n(p.costoKm)
  const personale = n(d.personale) * n(d.ore) * n(p.costoOraPersonale)
  const coperto = ospiti * n(p.costoCoperto)
  const totale = cibo + bere + trasporto + personale + coperto
  const ricarico = totale * (n(p.ricaricoPercento) / 100)
  const imponibile = totale + ricarico
  const iva = imponibile * (n(p.ivaPercento) / 100)
  const totaleConIva = imponibile + iva
  return {
    cibo,
    bere,
    trasporto,
    personale,
    coperto,
    totale,
    ricarico,
    imponibile,
    iva,
    totaleConIva,
    aPersona: ospiti > 0 ? totaleConIva / ospiti : null,
  }
}

/**
 * Legge e valida i parametri arrivati da un modulo (stringhe o numeri, virgola
 * o punto). Restituisce i problemi in italiano, uno per campo.
 */
export function leggiParametriCatering(
  b: Record<string, unknown>,
): { dati: ParametriCatering } | { problemi: string[] } {
  const problemi: string[] = []
  const dati = {} as ParametriCatering
  for (const k of Object.keys(PARAMETRI_CATERING_PREDEFINITI) as (keyof ParametriCatering)[]) {
    const v = numeroDa(b[k])
    const nome = ETICHETTE_PARAMETRI[k].titolo
    if (v == null) problemi.push(`${nome}: manca il valore`)
    else if (v < 0) problemi.push(`${nome}: non può essere negativo`)
    else if ((k === 'ivaPercento' || k === 'ricaricoPercento') && v > 1000) problemi.push(`${nome}: va scritta in percento (es. 10)`)
    else dati[k] = v
  }
  return problemi.length ? { problemi } : { dati }
}

/** "1,5" → 1.5 · "" → null. */
export function numeroDa(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/\s/g, '').replace(',', '.')
  if (!s) return null
  const x = Number(s)
  return Number.isFinite(x) ? x : null
}
