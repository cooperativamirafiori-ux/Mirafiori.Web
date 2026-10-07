/**
 * Conti e raggruppamenti della schermata Responsabili: funzioni pure, senza
 * React, così si provano da sole.
 */

import type { PersonaAbilitazione } from '@/types/timbrature'

/**
 * Casella condivisa delle Risorse Umane. Indicarla come referente equivale a
 * "lo validano le HR", come il referente vuoto: le HR vedono comunque tutti.
 */
export const CASELLA_HR = 'risorseumane@cooperativamirafiori.com'

export type Filtro =
  | 'tutti'
  | 'abilitati'
  | 'non-abilitati'
  | 'non-timbra'
  | 'hr'
  | 'referente-da-controllare'
  | 'senza-orario'
  | 'decaduti'
  | 'senza-mail'
  | 'disallineati'

/** I quattro filtri sempre visibili nella scheda "Tutte le persone". */
export const FILTRI_BASE: readonly { id: Filtro; etichetta: string }[] = [
  { id: 'tutti', etichetta: 'Tutti' },
  { id: 'abilitati', etichetta: 'Abilitati' },
  { id: 'non-abilitati', etichetta: 'Non abilitati' },
  { id: 'non-timbra', etichetta: 'Non timbrano' },
]

/**
 * I casi da sistemare, scritti come frasi: compaiono nel riquadro "Da
 * sistemare" solo quando ce n'è almeno uno. `frase(n)` dice cosa non va,
 * `rimedio` cosa fare.
 */
export interface DefProblema {
  id: Filtro
  /** Breve, per l'etichetta del filtro attivo. */
  etichetta: string
  frase: (n: number) => string
  rimedio: string
}

const persone = (n: number) => (n === 1 ? '1 persona' : `${n} persone`)

export const PROBLEMI: readonly DefProblema[] = [
  {
    id: 'referente-da-controllare',
    etichetta: 'Referente inesistente',
    frase: (n) => `${persone(n)} ${n === 1 ? 'ha' : 'hanno'} un referente che non esiste`,
    rimedio: 'Nessuno riceverà il foglio da validare: scegli il responsabile giusto.',
  },
  {
    id: 'senza-orario',
    etichetta: 'Senza orario teorico',
    frase: (n) => `${persone(n)} senza orario teorico`,
    rimedio: 'Senza orario le ore attese sono zero e non parte nessun sollecito. Si imposta dal cruscotto.',
  },
  {
    id: 'senza-mail',
    etichetta: 'Senza mail aziendale',
    frase: (n) => `${persone(n)} con timbrature attive ma senza mail aziendale`,
    rimedio: 'Senza mail non possono entrare: va inserita nella scheda in Risorse Umane.',
  },
  {
    id: 'decaduti',
    etichetta: 'Rapporto chiuso',
    frase: (n) => `${persone(n)} con rapporto chiuso e spunta ancora attiva`,
    rimedio: 'L’accesso è già spento da solo: puoi togliere la spunta per fare ordine.',
  },
  {
    id: 'disallineati',
    etichetta: 'Da riallineare',
    frase: (n) => `${n === 1 ? '1 scheda modificata' : `${n} schede modificate`} fuori dall’app`,
    rimedio: 'Il foglio ore non lo sa ancora: premi “Riallinea”.',
  },
]

/** Tutti i filtri, per i conteggi. */
const TUTTI_I_FILTRI: readonly Filtro[] = [...FILTRI_BASE.map((f) => f.id), 'hr', ...PROBLEMI.map((p) => p.id)]

export function inCaricoHr(p: PersonaAbilitazione): boolean {
  return !p.referente || p.referente === CASELLA_HR
}

/**
 * Il referente non è nessun account della cooperativa. Con la rubrica vuota
 * (Graph muto) non si può dire: meglio nessun allarme che uno falso.
 */
export function referenteSconosciuto(p: PersonaAbilitazione, inRubrica: Set<string>): boolean {
  if (inRubrica.size === 0 || inCaricoHr(p)) return false
  return !inRubrica.has(p.referente!)
}

export function passa(p: PersonaAbilitazione, f: Filtro, inRubrica: Set<string>): boolean {
  switch (f) {
    case 'tutti':
      return true
    case 'abilitati':
      return p.abilitata
    case 'non-abilitati':
      return !p.abilitata && !p.chiuso
    case 'hr':
      return p.abilitata && inCaricoHr(p)
    case 'referente-da-controllare':
      return p.abilitata && referenteSconosciuto(p, inRubrica)
    case 'non-timbra':
      return p.abilitata && p.nonTimbra
    case 'senza-orario':
      return p.senzaOrario
    case 'decaduti':
      return p.decaduta
    case 'senza-mail':
      return p.timbraturaAttiva && !p.mail && !p.chiuso
    case 'disallineati':
      return p.disallineata
  }
}

export function conta(elenco: PersonaAbilitazione[], inRubrica: Set<string>): Record<Filtro, number> {
  const out = Object.fromEntries(TUTTI_I_FILTRI.map((f) => [f, 0])) as Record<Filtro, number>
  for (const p of elenco) for (const f of TUTTI_I_FILTRI) if (passa(p, f, inRubrica)) out[f]++
  return out
}

export function cerca(p: PersonaAbilitazione, testo: string, nomeDi: (email: string) => string): boolean {
  const q = testo.trim().toLowerCase()
  if (!q) return true
  return (
    p.nominativo.toLowerCase().includes(q) ||
    p.mail.includes(q) ||
    (!!p.referente && (p.referente.includes(q) || nomeDi(p.referente).toLowerCase().includes(q)))
  )
}

export interface Gruppo {
  /** 'hr' oppure l'email del responsabile. */
  chiave: string
  titolo: string
  sottotitolo: string
  /** Referente che non è nessun account: il gruppo va in cima, in ambra. */
  sconosciuto: boolean
  persone: PersonaAbilitazione[]
}

/**
 * Le persone abilitate raggruppate per responsabile. Ordine: prima i referenti
 * sconosciuti (da sistemare), poi le HR, poi i responsabili per nome.
 */
export function perResponsabile(
  persone: PersonaAbilitazione[],
  nomeDi: (email: string) => string,
  inRubrica: Set<string>,
): Gruppo[] {
  const mappa = new Map<string, Gruppo>()
  for (const p of persone) {
    if (!p.abilitata) continue
    const hr = inCaricoHr(p)
    const chiave = hr ? 'hr' : p.referente!
    let g = mappa.get(chiave)
    if (!g) {
      const sconosciuto = !hr && referenteSconosciuto(p, inRubrica)
      g = {
        chiave,
        titolo: hr ? 'Risorse Umane' : sconosciuto ? 'Referente da correggere' : nomeDi(chiave),
        sottotitolo: hr
          ? 'Nessun responsabile indicato: validano le HR'
          : sconosciuto
            ? `“${chiave}” non è un account esistente`
            : '',
        sconosciuto,
        persone: [],
      }
      mappa.set(chiave, g)
    }
    g.persone.push(p)
  }
  const rango = (g: Gruppo) => (g.sconosciuto ? 0 : g.chiave === 'hr' ? 1 : 2)
  return [...mappa.values()].sort(
    (a, b) => rango(a) - rango(b) || a.titolo.localeCompare(b.titolo, 'it'),
  )
}

/**
 * "BORTOLAI SIMONA" → "Bortolai Simona", "D'ANGELO MARIAROSA" → "D'Angelo
 * Mariarosa". In anagrafica i nomi sono in maiuscolo: letti in elenco gridano.
 * Un nome già scritto con le minuscole si lascia com'è.
 */
export function nomeLeggibile(nome: string): string {
  if (nome !== nome.toUpperCase()) return nome
  return nome.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
}

/** Due iniziali per il cerchietto. */
export function iniziali(nome: string): string {
  const parole = nome.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  return ((parole[0]?.[0] ?? '?') + (parole[1]?.[0] ?? '')).toUpperCase()
}
