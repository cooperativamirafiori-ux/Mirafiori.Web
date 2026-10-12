/**
 * Conti della schermata Centri di costo, senza React: per area e per persona.
 */

import type { RuoliCentro } from '@/lib/centri-costo/data'

/** Ordine delle aree del modello di controllo di gestione (12/10/2026). */
export const ORDINE_AREE = [
  'Educativa',
  'Educativa Residenziale',
  'Autonomie',
  'Autonomie Adulti',
  'Socio Sanitaria',
  'Socio Culturale',
  'Contrasto violenza di genere',
  'Ristorazione',
  'Lavoro',
  'Ricettività',
  'Commercio',
  'Servizi Generali',
]

export interface GruppoArea {
  area: string
  /** Responsabili d'area: l'unione di quelli scritti sui centri dell'area. */
  responsabili: string[]
  /** true se i centri dell'area non hanno tutti lo stesso responsabile. */
  disallineata: boolean
  centri: RuoliCentro[]
}

const chiave = (e: string[]) => [...e].sort().join(';')

export function perArea(centri: RuoliCentro[], conSpenti: boolean): GruppoArea[] {
  const mappa = new Map<string, RuoliCentro[]>()
  for (const c of centri) {
    const a = c.area || 'Senza area'
    mappa.set(a, [...(mappa.get(a) ?? []), c])
  }
  const nomi = [...mappa.keys()].sort((a, b) => {
    const ia = ORDINE_AREE.indexOf(a)
    const ib = ORDINE_AREE.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'it')
  })
  return nomi
    .map((area) => {
      const tutti = mappa.get(area)!
      const responsabili = [...new Set(tutti.flatMap((c) => c.responsabiliArea))]
      const disallineata = new Set(tutti.map((c) => chiave(c.responsabiliArea))).size > 1
      return { area, responsabili, disallineata, centri: conSpenti ? tutti : tutti.filter((c) => c.attivo) }
    })
    .filter((g) => g.centri.length > 0)
}

export interface RuoliPersona {
  email: string
  aree: string[]
  centri: RuoliCentro[]
}

/** Ogni persona con i suoi ruoli, solo sui centri attivi. */
export function perPersona(centri: RuoliCentro[], nome: (e: string) => string): RuoliPersona[] {
  const mappa = new Map<string, RuoliPersona>()
  const voce = (e: string) => {
    if (!mappa.has(e)) mappa.set(e, { email: e, aree: [], centri: [] })
    return mappa.get(e)!
  }
  for (const c of centri) {
    if (!c.attivo) continue
    for (const e of c.coordinatori) voce(e).centri.push(c)
    for (const e of c.responsabiliArea) {
      const v = voce(e)
      if (c.area && !v.aree.includes(c.area)) v.aree.push(c.area)
    }
  }
  return [...mappa.values()].sort((a, b) => nome(a.email).localeCompare(nome(b.email), 'it'))
}

export interface Riepilogo {
  areeSenzaResponsabile: number
  centriSenzaCoordinatore: number
  persone: number
}

export function riepilogo(centri: RuoliCentro[]): Riepilogo {
  const attivi = centri.filter((c) => c.attivo)
  const aree = perArea(attivi, false)
  return {
    areeSenzaResponsabile: aree.filter((a) => a.responsabili.length === 0).length,
    centriSenzaCoordinatore: attivi.filter((c) => c.coordinatori.length === 0).length,
    persone: new Set(attivi.flatMap((c) => [...c.coordinatori, ...c.responsabiliArea])).size,
  }
}
