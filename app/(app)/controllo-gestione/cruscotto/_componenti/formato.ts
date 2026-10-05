'use client'

/**
 * Formati, colori e piccole animazioni del cruscotto.
 */

import { useEffect, useRef, useState } from 'react'

export const MESI = ['G', 'F', 'M', 'A', 'M', 'G', 'L', 'A', 'S', 'O', 'N', 'D']
export const MESI_LUNGHI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

export function euro(n: number, decimali = 0): string {
  return n.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  })
}

/** Per assi e spazi stretti: 12k €, 1,2 M€. */
export function euroBreve(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} M€`
  if (a >= 10_000) return `${Math.round(n / 1000)}k €`
  if (a >= 1_000) return `${(n / 1000).toFixed(1).replace('.', ',')}k €`
  return euro(n)
}

export function numero(n: number, decimali = 0): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: decimali, maximumFractionDigits: decimali })
}

export function dataBreve(iso: string): string {
  const [a, m, g] = iso.split('-')
  return g && m ? `${g}/${m}/${a.slice(2)}` : iso
}

/**
 * Colore per AREA, fisso per nome: il colore segue l'area, non la posizione in
 * classifica, così un filtro o un coordinatore che vede due aree non ridipinge
 * niente. Otto tinte validate per il daltonismo nell'ordine delle aree
 * sull'anagrafica; le due aree da un solo centro (Ricettività, Commercio)
 * stanno in "Altre aree", grigio.
 */
const COLORI_AREA: Record<string, string> = {
  Lavoro: '#2a78d6',
  Ristorazione: '#eb6834',
  'Pari opportunità': '#1baf7a',
  'Area Socio-Culturale': '#eda100',
  'Area Socio Sanitaria': '#e87ba4',
  'Area Educativa': '#008300',
  'Area Autonomie': '#4a3aa7',
  'Servizi Generali': '#e34948',
}
export const GRIGIO_ALTRO = '#8a8984'
export const ALTRE_AREE = 'Altre aree'

export function gruppoArea(area: string): string {
  return COLORI_AREA[area] ? area : ALTRE_AREE
}

export function coloreArea(area: string): string {
  return COLORI_AREA[area] ?? GRIGIO_ALTRO
}

/** Ordine fisso delle aree (quello dell'anagrafica), "Altre aree" in fondo. */
export const ORDINE_AREE = [...Object.keys(COLORI_AREA), ALTRE_AREE]

function movimentoRidotto(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Numero che sale da 0 al valore, una volta sola all'apertura. */
export function useConta(valore: number, durata = 1100): number {
  const [v, setV] = useState(0)
  const da = useRef(0)
  useEffect(() => {
    if (movimentoRidotto()) {
      setV(valore)
      return
    }
    const inizio = performance.now()
    const partenza = da.current
    let id = 0
    const passo = (t: number) => {
      const p = Math.min(1, (t - inizio) / durata)
      const e = 1 - Math.pow(1 - p, 3)
      const x = partenza + (valore - partenza) * e
      setV(x)
      da.current = x
      if (p < 1) id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [valore, durata])
  return v
}

/** true dal secondo fotogramma: fa partire le transizioni CSS d'ingresso. */
export function useMontato(): boolean {
  const [m, setM] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setM(true)))
    return () => cancelAnimationFrame(id)
  }, [])
  return m
}

/** Larghezza reale di un elemento, per disegnare gli SVG senza deformarli. */
export function useLarghezza<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}
